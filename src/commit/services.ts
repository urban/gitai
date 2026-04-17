import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";

import type { CommitProposal, StagedSnapshot } from "./contracts.ts";
import type {
  CommitMessageGeneratorError,
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
} from "./errors.ts";
import {
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
>()("@urban/gitai/commit/CommitMessageGenerator") {}
