import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { Context, Effect, Layer, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { CommitProposal, GitAiConfigReference, type StagedSnapshot } from "../domain/Commit";
import type {
  CommitMessageGeneratorError,
  CommitMessageGeneratorErrorReason,
} from "../errors/CommitError";
import { CommitMessageGeneratorError as CommitMessageGeneratorErrorClass } from "../errors/CommitError";

type CodexExecResult = {
  readonly exitCode: ChildProcessSpawner.ExitCode;
  readonly stderr: string;
  readonly stdout: string;
};

const textEncoder = new TextEncoder();

const CodexCommitProposal = Schema.Struct({
  body: Schema.NullOr(Schema.NonEmptyString),
  summary: Schema.NonEmptyString,
});

const decodeCodexCommitProposal = Schema.decodeUnknownSync(
  Schema.fromJsonString(CodexCommitProposal),
);

const normalizeCommitProposal = (proposal: typeof CodexCommitProposal.Type): CommitProposal =>
  proposal.body === null
    ? {
        summary: proposal.summary,
      }
    : {
        body: proposal.body,
        summary: proposal.summary,
      };

const commitProposalOutputSchema = JSON.stringify({
  additionalProperties: false,
  properties: {
    body: {
      anyOf: [
        {
          minLength: 1,
          type: "string",
        },
        {
          type: "null",
        },
      ],
    },
    summary: {
      minLength: 1,
      type: "string",
    },
  },
  required: ["summary", "body"],
  type: "object",
});

const buildCommitProposalPrompt = (
  snapshot: StagedSnapshot,
  instruction: string | undefined,
  reasoningEffort: string,
): string => {
  const sections = [
    [
      "You write Git commit proposals from staged diffs.",
      "Return exactly one JSON object that matches the provided output schema.",
      "Do not wrap the JSON in Markdown.",
      `Use ${reasoningEffort} reasoning effort when choosing the summary and optional body.`,
      "Keep the summary specific to the staged changes.",
      "Set body to null when no body adds useful detail.",
    ].join("\n"),
    `Staged diff:\n${snapshot.stagedPatch}`,
  ];

  if (instruction !== undefined) {
    sections.push(`Additional instruction:\n${instruction}`);
  }

  return sections.join("\n\n");
};

const isSuccessfulExitCode = (exitCode: ChildProcessSpawner.ExitCode): boolean =>
  exitCode === ChildProcessSpawner.ExitCode(0);

const streamFromText = (text: string) => Stream.fromIterable([textEncoder.encode(text)]);

const toErrorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const makeCommitMessageGeneratorError = (
  reason: CommitMessageGeneratorErrorReason,
  message: string,
): CommitMessageGeneratorError =>
  new CommitMessageGeneratorErrorClass({
    reason,
    message: message === "" ? "commit message generation failed" : message,
  });

const toProviderError = (message: string): CommitMessageGeneratorError =>
  makeCommitMessageGeneratorError("provider", message);

const toResponseDecodeError = (message: string): CommitMessageGeneratorError =>
  makeCommitMessageGeneratorError("response-decode", message);

const toProviderErrorFromPlatform = (
  error: PlatformError.PlatformError,
): CommitMessageGeneratorError => toProviderError(error.message);

const formatCodexExecFailureMessage = (result: CodexExecResult): string => {
  const stderr = result.stderr.trim();

  if (stderr !== "") {
    return stderr;
  }

  const stdout = result.stdout.trim();

  if (stdout !== "") {
    return stdout;
  }

  return `codex exec failed with exit code ${result.exitCode}`;
};

const inferCodexExecFailureReason = (message: string): CommitMessageGeneratorErrorReason =>
  /\bmodel\b/iu.test(message) ? "model" : "provider";

export class CommitMessageGenerator extends Context.Service<
  CommitMessageGenerator,
  {
    generate(
      snapshot: StagedSnapshot,
      instruction: string | undefined,
    ): Effect.Effect<CommitProposal, CommitMessageGeneratorError>;
  }
>()("@urban/gitai/services/CommitMessageGenerator") {
  static readonly layer = Layer.effect(
    CommitMessageGenerator,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const collectCodexExecResult = Effect.fn("CommitMessageGenerator.collectCodexExecResult")(
        function* (
          handle: ChildProcessSpawner.ChildProcessHandle,
        ): Effect.fn.Return<CodexExecResult, CommitMessageGeneratorError> {
          return yield* Effect.all(
            {
              stdout: handle.stdout.pipe(
                Stream.decodeText(),
                Stream.mkString,
                Effect.mapError(toProviderErrorFromPlatform),
              ),
              stderr: handle.stderr.pipe(
                Stream.decodeText(),
                Stream.mkString,
                Effect.mapError(toProviderErrorFromPlatform),
              ),
              exitCode: handle.exitCode.pipe(Effect.mapError(toProviderErrorFromPlatform)),
            },
            { concurrency: "unbounded" },
          );
        },
      );

      const generate = Effect.fn("CommitMessageGenerator.generate")(function* (
        snapshot: StagedSnapshot,
        instruction: string | undefined,
      ): Effect.fn.Return<CommitProposal, CommitMessageGeneratorError> {
        const config = yield* GitAiConfigReference;

        return yield* Effect.scoped(
          Effect.gen(function* () {
            const outputPath = yield* fileSystem
              .makeTempFileScoped({ prefix: "gitai-codex-output-" })
              .pipe(Effect.mapError((error) => toProviderError(error.message)));
            const schemaPath = yield* fileSystem
              .makeTempFileScoped({ prefix: "gitai-codex-schema-" })
              .pipe(Effect.mapError((error) => toProviderError(error.message)));

            yield* fileSystem
              .writeFileString(schemaPath, commitProposalOutputSchema)
              .pipe(Effect.mapError((error) => toProviderError(error.message)));

            const handle = yield* spawner
              .spawn(
                ChildProcess.make(
                  "codex",
                  [
                    "exec",
                    "--model",
                    config.model,
                    "--sandbox",
                    "read-only",
                    "--ephemeral",
                    "--color",
                    "never",
                    "--output-schema",
                    schemaPath,
                    "--output-last-message",
                    outputPath,
                  ],
                  {
                    cwd: snapshot.repoRoot,
                    stdin: streamFromText(
                      buildCommitProposalPrompt(snapshot, instruction, config.reasoningEffort),
                    ),
                  },
                ),
              )
              .pipe(Effect.mapError(toProviderErrorFromPlatform));

            const result = yield* collectCodexExecResult(handle);

            if (!isSuccessfulExitCode(result.exitCode)) {
              const message = formatCodexExecFailureMessage(result);

              return yield* Effect.fail(
                makeCommitMessageGeneratorError(inferCodexExecFailureReason(message), message),
              );
            }

            const output = yield* fileSystem
              .readFileString(outputPath)
              .pipe(Effect.mapError((error) => toProviderError(error.message)));

            return yield* Effect.try({
              try: () => normalizeCommitProposal(decodeCodexCommitProposal(output)),
              catch: (cause) => toResponseDecodeError(toErrorMessage(cause)),
            });
          }),
        );
      });

      return CommitMessageGenerator.of({
        generate,
      });
    }),
  );

  static readonly liveLayer = CommitMessageGenerator.layer;
}
