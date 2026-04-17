import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Config as EffectConfig, Context, Effect, Layer } from "effect";
import { AiError, LanguageModel } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

import { CommitProposal, GitAiConfigReference, type StagedSnapshot } from "./contracts.ts";
import type {
  CommitMessageGeneratorError,
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
} from "./errors.ts";
import {
  CommitMessageGeneratorError as CommitMessageGeneratorErrorClass,
  NoStagedChangesError as NoStagedChangesErrorClass,
  NotGitRepositoryError as NotGitRepositoryErrorClass,
  GitCommandError as GitCommandErrorClass,
  IndexChangedDuringReviewError as IndexChangedDuringReviewErrorClass,
} from "./errors.ts";

type GitCommand = readonly [string, ...Array<string>];

type GitProcessResult = {
  readonly error?: Error;
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
};

const formatGitFailureMessage = (result: GitProcessResult): string => {
  const stderr = result.stderr.trim();

  if (stderr !== "") {
    return stderr;
  }

  const stdout = result.stdout.trim();

  return stdout !== "" ? stdout : "git command failed";
};

const gitCommand = (args: GitCommand): [string, ...Array<string>] => ["git", ...args];

const isNotGitRepositoryFailure = (result: GitProcessResult): boolean =>
  result.status === 128 && /not a git repository/u.test(result.stderr);

const trimTrailingNewlines = (value: string): string => value.replace(/\n+$/u, "");

const spawnGit = Effect.fn("GitRepository.spawnGit")(function* (cwd: string, args: GitCommand) {
  return yield* Effect.sync(() =>
    spawnSync("git", args, {
      cwd,
      encoding: "utf8",
    }),
  );
});

const toGitCommandError = (args: GitCommand, result: GitProcessResult): GitCommandError =>
  new GitCommandErrorClass({
    command: gitCommand(args),
    message: formatGitFailureMessage(result),
    exitCode: result.status === null ? undefined : result.status,
  });

const revParseShowToplevelCommand = (): GitCommand => ["rev-parse", "--show-toplevel"];

const diffCachedBinaryCommand = (): GitCommand => ["diff", "--cached", "--no-ext-diff", "--binary"];

const writeTreeCommand = (): GitCommand => ["write-tree"];

const commitWithFileCommand = (messageFilePath: string): GitCommand => [
  "commit",
  "--cleanup=verbatim",
  "--file",
  messageFilePath,
];

const commitWithTempFilePlaceholderCommand = (): GitCommand => [
  "commit",
  "--cleanup=verbatim",
  "--file",
  "<temp-message-file>",
];

const tempMessageDirectoryPrefix = join(tmpdir(), "gitai-commit-message-");

const tempMessageFileName = "COMMIT_EDITMSG";

const commitProposalPromptHeader = [
  "You write Git commit proposals from staged diffs.",
  "Return exactly one commit proposal object.",
  "Keep the summary specific to the staged changes and include a body only when it adds useful detail.",
].join("\n");

const cleanupTempDirectory = (tempDirectory: string) =>
  Effect.sync(() => {
    try {
      rmSync(tempDirectory, { recursive: true, force: true });
    } catch {
      return;
    }
  });

const toCommitMessageFileError = (message: string): GitCommandError =>
  new GitCommandErrorClass({
    command: gitCommand(commitWithTempFilePlaceholderCommand()),
    message,
  });

const resolveRepoRoot = Effect.fn("GitRepository.resolveRepoRoot")(function* (
  cwd: string,
): Effect.fn.Return<string, NotGitRepositoryError | GitCommandError> {
  const args = revParseShowToplevelCommand();
  const result = yield* spawnGit(cwd, args);

  if (result.error !== undefined) {
    return yield* toGitCommandError(args, result);
  }

  if (result.status !== 0) {
    if (isNotGitRepositoryFailure(result)) {
      return yield* new NotGitRepositoryErrorClass({ cwd });
    }

    return yield* toGitCommandError(args, result);
  }

  return trimTrailingNewlines(result.stdout);
});

const loadSnapshot = Effect.fn("GitRepository.loadSnapshot")(function* (
  cwd: string,
): Effect.fn.Return<
  StagedSnapshot,
  NotGitRepositoryError | NoStagedChangesError | GitCommandError
> {
  const repoRoot = yield* resolveRepoRoot(cwd);

  const diffArgs = diffCachedBinaryCommand();
  const diffResult = yield* spawnGit(repoRoot, diffArgs);

  if (diffResult.error !== undefined || diffResult.status !== 0) {
    return yield* toGitCommandError(diffArgs, diffResult);
  }

  if (diffResult.stdout === "") {
    return yield* new NoStagedChangesErrorClass({ repoRoot });
  }

  const fingerprintArgs = writeTreeCommand();
  const fingerprintResult = yield* spawnGit(repoRoot, fingerprintArgs);

  if (fingerprintResult.error !== undefined || fingerprintResult.status !== 0) {
    return yield* toGitCommandError(fingerprintArgs, fingerprintResult);
  }

  return {
    repoRoot,
    stagedPatch: diffResult.stdout,
    indexFingerprint: trimTrailingNewlines(fingerprintResult.stdout),
  };
});

const loadCurrentFingerprint = Effect.fn("GitRepository.loadCurrentFingerprint")(function* (
  repoRoot: string,
): Effect.fn.Return<string, GitCommandError> {
  const args = writeTreeCommand();
  const result = yield* spawnGit(repoRoot, args);

  if (result.error !== undefined || result.status !== 0) {
    return yield* toGitCommandError(args, result);
  }

  return trimTrailingNewlines(result.stdout);
});

const commitApproved = Effect.fn("GitRepository.commitApproved")(function* (
  snapshot: StagedSnapshot,
  commitMessage: string,
): Effect.fn.Return<void, IndexChangedDuringReviewError | GitCommandError> {
  const currentFingerprint = yield* loadCurrentFingerprint(snapshot.repoRoot);

  if (currentFingerprint !== snapshot.indexFingerprint) {
    return yield* new IndexChangedDuringReviewErrorClass({ repoRoot: snapshot.repoRoot });
  }

  const tempDirectory = yield* Effect.try({
    try: () => mkdtempSync(tempMessageDirectoryPrefix),
    catch: (cause) =>
      toCommitMessageFileError(
        cause instanceof Error ? cause.message : "Failed to create a temporary commit message file",
      ),
  });

  const messageFilePath = join(tempDirectory, tempMessageFileName);

  return yield* Effect.gen(function* (): Effect.fn.Return<void, GitCommandError> {
    yield* Effect.try({
      try: () => writeFileSync(messageFilePath, commitMessage, { encoding: "utf8" }),
      catch: (cause) =>
        toCommitMessageFileError(
          cause instanceof Error
            ? cause.message
            : "Failed to write the temporary commit message file",
        ),
    });

    const commitArgs = commitWithFileCommand(messageFilePath);
    const commitResult = yield* spawnGit(snapshot.repoRoot, commitArgs);

    if (commitResult.error !== undefined || commitResult.status !== 0) {
      return yield* toGitCommandError(commitArgs, commitResult);
    }
  }).pipe(Effect.ensuring(cleanupTempDirectory(tempDirectory)));
});

const buildCommitProposalPrompt = (
  snapshot: StagedSnapshot,
  instruction: string | undefined,
): string => {
  const sections = [commitProposalPromptHeader, `Staged diff:\n${snapshot.stagedPatch}`];

  if (instruction !== undefined) {
    sections.push(`Additional instruction:\n${instruction}`);
  }

  return sections.join("\n\n");
};

const toCommitMessageGeneratorError = (error: AiError.AiError): CommitMessageGeneratorError => {
  switch (error.reason._tag) {
    case "StructuredOutputError":
    case "InvalidOutputError":
    case "UnsupportedSchemaError":
      return new CommitMessageGeneratorErrorClass({
        reason: "response-decode",
        message: error.message,
      });
    case "InvalidRequestError":
      return new CommitMessageGeneratorErrorClass({
        reason: "model",
        message: error.message,
      });
    default:
      return new CommitMessageGeneratorErrorClass({
        reason: "provider",
        message: error.message,
      });
  }
};

const openAiClientLayer = OpenAiClient.layerConfig({
  apiKey: EffectConfig.redacted("OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

const openAiLanguageModelLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* GitAiConfigReference;

    return OpenAiLanguageModel.layer({
      model: config.model,
      config: {
        reasoning: {
          effort: config.reasoningEffort,
        },
      },
    });
  }),
);

export class GitRepository extends Context.Service<
  GitRepository,
  {
    loadSnapshot(
      cwd: string,
    ): Effect.Effect<
      StagedSnapshot,
      NotGitRepositoryError | NoStagedChangesError | GitCommandError
    >;
    commitApproved(
      snapshot: StagedSnapshot,
      commitMessage: string,
    ): Effect.Effect<void, IndexChangedDuringReviewError | GitCommandError>;
  }
>()("@urban/gitai/commit/GitRepository") {
  static readonly layer = Layer.succeed(
    GitRepository,
    GitRepository.of({
      loadSnapshot,
      commitApproved,
    }),
  );
}

export class CommitMessageGenerator extends Context.Service<
  CommitMessageGenerator,
  {
    generate(
      snapshot: StagedSnapshot,
      instruction: string | undefined,
    ): Effect.Effect<CommitProposal, CommitMessageGeneratorError>;
  }
>()("@urban/gitai/commit/CommitMessageGenerator") {
  static readonly languageModelLayer = openAiLanguageModelLayer;

  static readonly providerLayer = CommitMessageGenerator.languageModelLayer.pipe(
    Layer.provide(openAiClientLayer),
  );

  static readonly layer = Layer.effect(
    CommitMessageGenerator,
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel;
      const generate = Effect.fn("CommitMessageGenerator.generate")(function* (
        snapshot: StagedSnapshot,
        instruction: string | undefined,
      ): Effect.fn.Return<CommitProposal, CommitMessageGeneratorError> {
        const response = yield* model
          .generateObject({
            objectName: "commit_proposal",
            prompt: buildCommitProposalPrompt(snapshot, instruction),
            schema: CommitProposal,
          })
          .pipe(Effect.mapError(toCommitMessageGeneratorError));

        return response.value;
      });

      return CommitMessageGenerator.of({
        generate,
      });
    }),
  );

  static readonly liveLayer = CommitMessageGenerator.layer.pipe(
    Layer.provide(CommitMessageGenerator.providerLayer),
  );
}
