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

const buildCodexArgs = ({
  outputFilepath,
  outputSchemaFilepath,
}: {
  outputFilepath: string;
  outputSchemaFilepath?: string | undefined;
}) => {
  const args = [
    "-a",
    "never",
    "exec",
    "--sandbox",
    "read-only",
    "--output-last-message",
    outputFilepath,
  ];

  if (outputSchemaFilepath !== undefined) {
    args.push("--output-schema", outputSchemaFilepath);
  }

  args.push("-");
  return args;
};

const resolveTopLevelRef = (document: ReturnType<typeof Schema.toJsonSchemaDocument>) => {
  const ref =
    typeof document.schema === "object" &&
    document.schema !== null &&
    "$ref" in document.schema &&
    typeof document.schema.$ref === "string"
      ? document.schema.$ref
      : undefined;

  if (ref === undefined || !ref.startsWith("#/$defs/")) {
    return document.schema;
  }

  const definitionKey = ref.slice("#/$defs/".length);
  return document.definitions[definitionKey] ?? document.schema;
};

const renderOutputSchema = Effect.fn("CliAgent.renderOutputSchema")(function* (schema: Schema.Top) {
  return yield* Effect.try({
    try: () => {
      const document = Schema.toJsonSchemaDocument(schema);
      const jsonSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        ...resolveTopLevelRef(document),
        ...(Object.keys(document.definitions).length === 0
          ? {}
          : {
              $defs: document.definitions,
            }),
      };
      return JSON.stringify(jsonSchema, null, 2);
    },
    catch: (cause) =>
      new CliAgentError({
        message: "Failed to render codex output schema",
        cause,
      }),
  });
});

class CliAgent extends Context.Service<
  CliAgent,
  {
    readonly command: (
      options: CliAgentCommand,
    ) => Effect.Effect<string, CliAgentError | PlatformError.PlatformError, never>;
  }
>()("@gitai/CliAgent") {
  static readonly layer = Layer.effect(
    CliAgent,
    Effect.gen(function* () {
      const executor = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // TODO create AppConfig
      const isDebug = yield* Config.boolean("DEBUG").pipe(Config.withDefault(false));
      const codexTimeoutMs = yield* Config.number("CODEX_TIMEOUT_MS").pipe(
        Config.withDefault(300_000),
      );
      const codexTimeout = Duration.millis(codexTimeoutMs);

      const command = Effect.fn("CliAgent.command")(function* ({
        outputSchema,
        prompt,
      }: CliAgentCommand) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            yield* Effect.log("Running command...");

            const tempDirectory = yield* fs.makeTempDirectoryScoped({ prefix: "gitai-codex-" });
            const outputFilepath = path.join(tempDirectory, OUTPUT_LAST_MESSAGE_FILENAME);

            let outputSchemaFilepath: string | undefined;
            if (outputSchema !== undefined) {
              outputSchemaFilepath = path.join(tempDirectory, OUTPUT_SCHEMA_FILENAME);
              const outputSchemaContents = yield* renderOutputSchema(outputSchema);
              yield* fs.writeFileString(outputSchemaFilepath, outputSchemaContents);
            }

            const args = buildCodexArgs({ outputFilepath, outputSchemaFilepath });

            const cmd = ChildProcess.make("codex", args, {
              stderr: "pipe",
              stdin: Stream.make(new TextEncoder().encode(prompt)),
              stdout: "pipe",
            });

            if (isDebug) {
              yield* Effect.log(`Running codex ${args.join(" ")}`);
            }

            const process = yield* executor.spawn(cmd);

            const stderrFiber = yield* process.stderr.pipe(
              Stream.decodeText(),
              Stream.tap((chunk) =>
                isDebug ? Effect.log(`[codex stderr] ${chunk}`) : Effect.void,
              ),
              Stream.runCollect,
              Effect.map((chunks) => chunks.join("")),
              Effect.forkScoped,
            );

            const stdoutFiber = yield* process.stdout.pipe(
              Stream.decodeText(),
              Stream.tap((chunk) => (isDebug ? Effect.log(chunk) : Effect.void)),
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
              return yield* timeoutError;
            }

            const [stdout, stderr] = yield* Effect.all(
              [Fiber.join(stdoutFiber), Fiber.join(stderrFiber)],
              {
                concurrency: "unbounded",
              },
            );

            if (Exit.isFailure(exit)) {
              return yield* new CliAgentError({
                message: "Codex process failed to exit cleanly",
                cause: { stderr, stdout, exit: exit.cause },
              });
            }

            if (exit.value !== 0) {
              return yield* new CliAgentError({
                message: `Codex exited with code ${exit.value}`,
                cause: { stderr, stdout },
              });
            }

            if (!(yield* fs.exists(outputFilepath))) {
              return yield* new CliAgentError({
                message: "Codex did not produce a final response",
                cause: { outputFilepath, stderr, stdout },
              });
            }

            const response = yield* fs.readFileString(outputFilepath);

            if (response.trim().length === 0) {
              return yield* new CliAgentError({
                message: "Codex produced an empty final response",
                cause: { outputFilepath, stderr, stdout },
              });
            }

            return response;
          }),
        );
      });

      return CliAgent.of({
        command,
      });
    }),
  );
}

export { CliAgent, CliAgentError, buildCodexArgs, renderOutputSchema };
