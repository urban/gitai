import {
  Config,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  PlatformError,
  Schema,
  Context,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

class CliAgentError extends Schema.TaggedErrorClass<CliAgentError>()("CliAgentError", {
  message: Schema.NonEmptyString,
  cause: Schema.optional(Schema.Unknown),
}) {}

type CliAgentCommand = Readonly<{
  prompt: string;
  outputSchema?: Schema.Top | undefined;
}>;

const OUTPUT_LAST_MESSAGE_FILENAME = "codex-last-message.txt";
const OUTPUT_SCHEMA_FILENAME = "codex-output-schema.json";

type JsonSchemaDocument = ReturnType<typeof Schema.toJsonSchemaDocument>;
type JsonSchema = JsonSchemaDocument["schema"];

const buildCodexArgs = ({
  outputFilepath,
  outputSchemaFilepath,
}: {
  readonly outputFilepath: string;
  readonly outputSchemaFilepath?: string | undefined;
}): ReadonlyArray<string> => [
  "-a",
  "never",
  "exec",
  "--sandbox",
  "read-only",
  "--output-last-message",
  outputFilepath,
  ...(outputSchemaFilepath === undefined ? [] : ["--output-schema", outputSchemaFilepath]),
  "-",
];

const isObjectRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Object(value) === value;

const isTopLevelRef = (
  schema: JsonSchema,
): schema is JsonSchema & Readonly<{ readonly $ref: string }> =>
  isObjectRecord(schema) && typeof schema.$ref === "string";

const resolveTopLevelRef = (document: JsonSchemaDocument): JsonSchema => {
  const ref = isTopLevelRef(document.schema) ? document.schema.$ref : undefined;

  if (ref === undefined || !ref.startsWith("#/$defs/")) {
    return document.schema;
  }

  const definitionKey = ref.slice("#/$defs/".length);
  return document.definitions[definitionKey] ?? document.schema;
};

const renderOutputSchema = Effect.fn("CliAgent.renderOutputSchema")(function* (
  schema: Schema.Top,
): Effect.fn.Return<string, CliAgentError> {
  const document = yield* Effect.try({
    try: () => Schema.toJsonSchemaDocument(schema),
    catch: (cause) =>
      new CliAgentError({
        message: "Failed to render codex output schema",
        cause,
      }),
  });

  const jsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...resolveTopLevelRef(document),
    ...(Object.keys(document.definitions).length === 0
      ? {}
      : {
          $defs: document.definitions,
        }),
  };

  return yield* Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))(jsonSchema).pipe(
    Effect.mapError(
      (cause) =>
        new CliAgentError({
          message: "Failed to render codex output schema",
          cause,
        }),
    ),
  );
});

class CliAgent extends Context.Service<
  CliAgent,
  {
    readonly command: (
      options: CliAgentCommand,
    ) => Effect.Effect<string, CliAgentError | PlatformError.PlatformError, never>;
  }
>()("@urban/gitai/services/CliAgent/CliAgent") {
  static readonly layer = Layer.effect(
    CliAgent,
    Effect.gen(function* () {
      const executor = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // TODO create AppConfig
      const codexTimeoutMs = yield* Config.number("CODEX_TIMEOUT_MS").pipe(
        Config.withDefault(300_000),
      );
      const codexTimeout = Duration.millis(codexTimeoutMs);

      const command = Effect.fn("CliAgent.command")(
        function* ({ outputSchema, prompt }: CliAgentCommand) {
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.logDebug("Preparing codex command", {
                hasOutputSchema: outputSchema !== undefined,
                promptBytes: prompt.length,
                timeoutMs: codexTimeoutMs,
              });

              const tempDirectory = yield* fs.makeTempDirectoryScoped({ prefix: "gitai-codex-" });
              const outputFilepath = path.join(tempDirectory, OUTPUT_LAST_MESSAGE_FILENAME);
              yield* Effect.logDebug("Created codex temp directory", {
                outputFilepath,
                tempDirectory,
              });

              let outputSchemaFilepath: string | undefined;
              if (outputSchema !== undefined) {
                outputSchemaFilepath = path.join(tempDirectory, OUTPUT_SCHEMA_FILENAME);
                const outputSchemaContents = yield* renderOutputSchema(outputSchema);
                yield* Effect.logDebug("Writing codex output schema", {
                  outputSchemaBytes: outputSchemaContents.length,
                  outputSchemaFilepath,
                });
                yield* fs.writeFileString(outputSchemaFilepath, outputSchemaContents);
              }

              const args = buildCodexArgs({ outputFilepath, outputSchemaFilepath });

              const cmd = ChildProcess.make("codex", args, {
                stderr: "pipe",
                stdin: Stream.make(new TextEncoder().encode(prompt)),
                stdout: "pipe",
              });

              yield* Effect.logDebug("Running codex command", {
                command: `codex ${args.join(" ")}`,
              });

              const process = yield* executor.spawn(cmd);

              const stderrFiber = yield* process.stderr.pipe(
                Stream.decodeText(),
                Stream.tap((chunk) => Effect.logDebug("codex stderr", { chunk })),
                Stream.runCollect,
                Effect.map((chunks) => chunks.join("")),
                Effect.forkScoped,
              );

              const stdoutFiber = yield* process.stdout.pipe(
                Stream.decodeText(),
                Stream.tap((chunk) => Effect.logDebug("codex stdout", { chunk })),
                Stream.runCollect,
                Effect.map((chunks) => chunks.join("")),
                Effect.forkScoped,
              );

              const timeoutError = new CliAgentError({
                message: `Codex exec timed out after ${codexTimeoutMs}ms`,
              });

              const exit = yield* Effect.exit(
                process.exitCode.pipe(
                  Effect.timeoutOrElse({
                    duration: codexTimeout,
                    orElse: () =>
                      process.kill({ killSignal: "SIGTERM" }).pipe(
                        Effect.catch(() => Effect.void),
                        Effect.andThen(Effect.fail(timeoutError)),
                      ),
                  }),
                ),
              );

              const failure = Exit.findErrorOption(exit);
              const didTimeout = Option.isSome(failure) && failure.value === timeoutError;

              if (didTimeout) {
                yield* Effect.logDebug("Codex command timed out", { timeoutMs: codexTimeoutMs });
                return yield* timeoutError;
              }

              const [stdout, stderr] = yield* Effect.all(
                [Fiber.join(stdoutFiber), Fiber.join(stderrFiber)],
                {
                  concurrency: "unbounded",
                },
              );
              yield* Effect.logDebug("Codex command streams collected", {
                stderrBytes: stderr.length,
                stdoutBytes: stdout.length,
              });

              if (Exit.isFailure(exit)) {
                yield* Effect.logDebug("Codex process failed to exit cleanly", {
                  exit: exit.cause,
                });
                return yield* new CliAgentError({
                  message: "Codex process failed to exit cleanly",
                  cause: { stderr, stdout, exit: exit.cause },
                });
              }

              yield* Effect.logDebug("Codex command exited", { exitCode: exit.value });
              if (exit.value !== 0) {
                return yield* new CliAgentError({
                  message: `Codex exited with code ${exit.value}`,
                  cause: { stderr, stdout },
                });
              }

              if (!(yield* fs.exists(outputFilepath))) {
                yield* Effect.logDebug("Codex final response file is missing", { outputFilepath });
                return yield* new CliAgentError({
                  message: "Codex did not produce a final response",
                  cause: { outputFilepath, stderr, stdout },
                });
              }

              const response = yield* fs.readFileString(outputFilepath);
              yield* Effect.logDebug("Read codex final response", {
                responseBytes: response.length,
              });

              if (response.trim().length === 0) {
                return yield* new CliAgentError({
                  message: "Codex produced an empty final response",
                  cause: { outputFilepath, stderr, stdout },
                });
              }

              return response;
            }),
          );
        },
        Effect.annotateLogs({ service: "CliAgent" }),
        Effect.withLogSpan("cli-agent.command"),
      );

      return CliAgent.of({
        command,
      });
    }),
  );
}

export { CliAgent, CliAgentError, buildCodexArgs, renderOutputSchema };
