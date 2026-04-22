import { NodeFileSystem } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Sink, Stream } from "effect";
import { readFileSync, writeFileSync } from "node:fs";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { renderCommitOperationalError } from "../commands/commit/render";
import { defaultGitAiConfig, GitAiConfigReference, type StagedSnapshot } from "../domain/Commit";
import { CommitMessageGenerator } from "./CommitMessageGenerator";

const stagedSnapshot = {
  repoRoot: "/tmp/repo",
  stagedPatch: [
    "diff --git a/src/index.ts b/src/index.ts",
    "--- a/src/index.ts",
    "+++ b/src/index.ts",
    "@@",
    '+console.log("hello");',
  ].join("\n"),
  indexFingerprint: "fingerprint-123",
} satisfies StagedSnapshot;

const encoder = new TextEncoder();

const encodeText = (text: string): Uint8Array => encoder.encode(text);

const streamFromText = (text: string) => Stream.fromIterable(text === "" ? [] : [encodeText(text)]);

const createHandle = (options?: {
  readonly exitCode?: number;
  readonly stderr?: string;
  readonly stdout?: string;
}) => {
  const stderr = options?.stderr ?? "";
  const stdout = options?.stdout ?? "";

  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(options?.exitCode ?? 0)),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stderr: streamFromText(stderr),
    stdin: Sink.drain,
    stdout: streamFromText(stdout),
    all: Stream.fromIterable(
      [stdout, stderr].filter((text): text is string => text !== "").map(encodeText),
    ),
    unref: Effect.succeed(Effect.void),
  });
};

const createSpawnerLayer = (spawn: Parameters<typeof ChildProcessSpawner.make>[0]) =>
  Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, ChildProcessSpawner.make(spawn));

const expectStandardCommand = (command: ChildProcess.Command): ChildProcess.StandardCommand => {
  if (command._tag !== "StandardCommand") {
    throw new Error("Expected a standard codex command");
  }

  return command;
};

const readPrompt = (
  stdin: ChildProcess.StandardCommand["options"]["stdin"],
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const commandInput =
      stdin !== undefined && typeof stdin !== "string" && "stream" in stdin ? stdin.stream : stdin;

    if (commandInput === undefined) {
      return yield* Effect.die(new Error("Expected codex prompt on stdin"));
    }

    if (typeof commandInput === "string") {
      return yield* Effect.die(new Error("Expected codex prompt stream on stdin"));
    }

    return yield* commandInput.pipe(Stream.decodeText(), Stream.mkString, Effect.orDie);
  });

const getFlagValue = (args: ReadonlyArray<string>, flag: string): string | undefined => {
  const index = args.indexOf(flag);

  return index === -1 ? undefined : args[index + 1];
};

const runGenerate = (options: {
  readonly instruction: string | undefined;
  readonly spawnerLayer: ReturnType<typeof createSpawnerLayer>;
  readonly config?: typeof defaultGitAiConfig;
}) => {
  const effect = Effect.gen(function* () {
    const generator = yield* CommitMessageGenerator;

    return yield* generator.generate(stagedSnapshot, options.instruction);
  }).pipe(
    Effect.provide(CommitMessageGenerator.layer),
    Effect.provide(options.spawnerLayer),
    Effect.provide(NodeFileSystem.layer),
  );

  return options.config === undefined
    ? effect
    : effect.pipe(Effect.provideService(GitAiConfigReference, options.config));
};

describe("CommitMessageGenerator", () => {
  it.effect(
    "generate builds one codex exec invocation from the staged patch and optional instruction",
    () =>
      Effect.gen(function* () {
        let capturedArgs: ReadonlyArray<string> = [];
        let capturedPrompt = "";
        let capturedSchema = "";
        let capturedWorkingDirectory: string | undefined;

        const proposal = yield* runGenerate({
          instruction: "focus on test coverage",
          spawnerLayer: createSpawnerLayer((command) =>
            Effect.gen(function* () {
              const standardCommand = expectStandardCommand(command);

              assert.strictEqual(standardCommand.command, "codex");
              capturedArgs = standardCommand.args;
              capturedWorkingDirectory = standardCommand.options.cwd;
              capturedPrompt = yield* readPrompt(standardCommand.options.stdin);

              const schemaPath = getFlagValue(standardCommand.args, "--output-schema");
              const outputPath = getFlagValue(standardCommand.args, "--output-last-message");

              if (schemaPath === undefined || outputPath === undefined) {
                throw new Error("Expected codex output files");
              }

              capturedSchema = readFileSync(schemaPath, "utf8");
              writeFileSync(
                outputPath,
                JSON.stringify({
                  summary: "test: improve generator coverage",
                  body: "Assert the staged diff and instruction both shape the request.",
                }),
                "utf8",
              );

              return createHandle();
            }),
          ),
        });

        assert.strictEqual(capturedArgs[0], "exec");
        assert.strictEqual(getFlagValue(capturedArgs, "--model"), defaultGitAiConfig.model);
        assert.strictEqual(getFlagValue(capturedArgs, "--sandbox"), "read-only");
        assert.isTrue(capturedArgs.includes("--ephemeral"));
        assert.strictEqual(getFlagValue(capturedArgs, "--color"), "never");
        assert.strictEqual(capturedWorkingDirectory, stagedSnapshot.repoRoot);
        assert.match(capturedPrompt, /focus on test coverage/u);
        assert.match(capturedPrompt, /diff --git a\/src\/index\.ts/u);
        assert.match(capturedPrompt, /Use medium reasoning effort/u);
        assert.match(capturedPrompt, /Set body to null when no body adds useful detail/u);
        assert.match(capturedSchema, /"summary"/u);
        assert.match(capturedSchema, /"body"/u);
        assert.match(capturedSchema, /"type":"null"/u);
        assert.match(capturedSchema, /"required":\["summary","body"\]/u);
        assert.deepStrictEqual(proposal, {
          summary: "test: improve generator coverage",
          body: "Assert the staged diff and instruction both shape the request.",
        });
      }),
  );

  it.effect(
    "generate uses the configured codex model and omits the instruction block when absent",
    () =>
      Effect.gen(function* () {
        let capturedArgs: ReadonlyArray<string> = [];
        let capturedPrompt = "";

        const proposal = yield* runGenerate({
          instruction: undefined,
          config: {
            model: "codex-mini",
            reasoningEffort: "high",
          },
          spawnerLayer: createSpawnerLayer((command) =>
            Effect.gen(function* () {
              const standardCommand = expectStandardCommand(command);

              capturedArgs = standardCommand.args;
              capturedPrompt = yield* readPrompt(standardCommand.options.stdin);

              const outputPath = getFlagValue(standardCommand.args, "--output-last-message");

              if (outputPath === undefined) {
                throw new Error("Expected codex output file");
              }

              writeFileSync(
                outputPath,
                JSON.stringify({
                  body: null,
                  summary: "feat: log hello from the CLI entrypoint",
                }),
                "utf8",
              );

              return createHandle();
            }),
          ),
        });

        assert.strictEqual(getFlagValue(capturedArgs, "--model"), "codex-mini");
        assert.match(capturedPrompt, /Use high reasoning effort/u);
        assert.match(capturedPrompt, /Set body to null when no body adds useful detail/u);
        assert.notMatch(capturedPrompt, /Additional instruction:/u);
        assert.deepStrictEqual(proposal, {
          summary: "feat: log hello from the CLI entrypoint",
        });
      }),
  );

  it.effect("generate maps codex exec failures into stderr-facing command errors", () =>
    Effect.gen(function* () {
      const cases = [
        {
          exitCode: 1,
          message: "unknown model codex-bad",
          reason: "model",
          matcher: /unknown model codex-bad/u,
        },
        {
          exitCode: 1,
          message: "authentication required",
          reason: "provider",
          matcher: /authentication required/u,
        },
      ] satisfies Array<{
        readonly exitCode: number;
        readonly message: string;
        readonly reason: "model" | "provider";
        readonly matcher: RegExp;
      }>;

      for (const testCase of cases) {
        const error = yield* runGenerate({
          instruction: undefined,
          spawnerLayer: createSpawnerLayer(() =>
            Effect.succeed(
              createHandle({
                exitCode: testCase.exitCode,
                stderr: testCase.message,
              }),
            ),
          ),
        }).pipe(Effect.flip);

        assert.strictEqual(error._tag, "CommitMessageGeneratorError");
        assert.strictEqual(error.reason, testCase.reason);

        const rendered = renderCommitOperationalError(error);

        assert.strictEqual(rendered.stream, "stderr");
        assert.match(rendered.text, testCase.matcher);
      }
    }),
  );

  it.effect("generate maps malformed codex output into a response-decode error", () =>
    Effect.gen(function* () {
      const error = yield* runGenerate({
        instruction: undefined,
        spawnerLayer: createSpawnerLayer((command) =>
          Effect.sync(() => {
            const standardCommand = expectStandardCommand(command);
            const outputPath = getFlagValue(standardCommand.args, "--output-last-message");

            if (outputPath === undefined) {
              throw new Error("Expected codex output file");
            }

            writeFileSync(outputPath, JSON.stringify({ body: "missing summary" }), "utf8");

            return createHandle();
          }),
        ),
      }).pipe(Effect.flip);

      assert.strictEqual(error._tag, "CommitMessageGeneratorError");
      assert.strictEqual(error.reason, "response-decode");

      const rendered = renderCommitOperationalError(error);

      assert.strictEqual(rendered.stream, "stderr");
      assert.match(rendered.text, /response-decode/u);
    }),
  );
});
