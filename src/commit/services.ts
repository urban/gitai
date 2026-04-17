import { spawnSync } from "node:child_process";
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
      commitApproved: Effect.fn("GitRepository.commitApproved")(function* (
        _snapshot: StagedSnapshot,
        _commitMessage: string,
      ): Effect.fn.Return<void, IndexChangedDuringReviewError | GitCommandError> {
        return yield* new GitCommandErrorClass({
          command: gitCommand(["commit", "--file", "<temp-message-file>"]),
          message: "GitRepository.commitApproved is not implemented yet",
        });
      }),
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
