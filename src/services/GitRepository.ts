import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { Context, Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { type StagedSnapshot } from "../domain/Commit.ts";
import type {
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
} from "../errors/CommitError.ts";
import {
  GitCommandError as GitCommandErrorClass,
  IndexChangedDuringReviewError as IndexChangedDuringReviewErrorClass,
  NoStagedChangesError as NoStagedChangesErrorClass,
  NotGitRepositoryError as NotGitRepositoryErrorClass,
} from "../errors/CommitError.ts";

type GitCommand = readonly [string, ...Array<string>];

type GitProcessResult = {
  readonly exitCode: ChildProcessSpawner.ExitCode;
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

const isSuccessfulExitCode = (exitCode: ChildProcessSpawner.ExitCode): boolean =>
  exitCode === ChildProcessSpawner.ExitCode(0);

const isNotGitRepositoryFailure = (result: GitProcessResult): boolean =>
  result.exitCode === ChildProcessSpawner.ExitCode(128) &&
  /not a git repository/u.test(result.stderr);

const trimTrailingNewlines = (value: string): string => value.replace(/\n+$/u, "");

const toGitCommandErrorFromPlatform = (
  args: GitCommand,
  error: PlatformError.PlatformError,
): GitCommandError =>
  new GitCommandErrorClass({
    command: gitCommand(args),
    message: error.message,
  });

const toGitCommandError = (args: GitCommand, result: GitProcessResult): GitCommandError =>
  new GitCommandErrorClass({
    command: gitCommand(args),
    message: formatGitFailureMessage(result),
    exitCode: result.exitCode,
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

const toCommitMessageFileError = (message: string): GitCommandError =>
  new GitCommandErrorClass({
    command: gitCommand(commitWithTempFilePlaceholderCommand()),
    message,
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
>()("@urban/gitai/services/GitRepository") {
  static readonly layer = Layer.effect(
    GitRepository,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const collectGitProcessResult = Effect.fn("GitRepository.collectGitProcessResult")(function* (
        handle: ChildProcessSpawner.ChildProcessHandle,
        args: GitCommand,
      ): Effect.fn.Return<GitProcessResult, GitCommandError> {
        return yield* Effect.all(
          {
            stdout: handle.stdout.pipe(
              Stream.decodeText(),
              Stream.mkString,
              Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)),
            ),
            stderr: handle.stderr.pipe(
              Stream.decodeText(),
              Stream.mkString,
              Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)),
            ),
            exitCode: handle.exitCode.pipe(
              Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)),
            ),
          },
          { concurrency: "unbounded" },
        );
      });

      const runGit = Effect.fn("GitRepository.runGit")(function* (
        cwd: string,
        args: GitCommand,
      ): Effect.fn.Return<GitProcessResult, GitCommandError> {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner
              .spawn(ChildProcess.make("git", args, { cwd }))
              .pipe(Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)));

            return yield* collectGitProcessResult(handle, args);
          }),
        );
      });

      const resolveRepoRoot = Effect.fn("GitRepository.resolveRepoRoot")(function* (
        cwd: string,
      ): Effect.fn.Return<string, NotGitRepositoryError | GitCommandError> {
        const args = revParseShowToplevelCommand();
        const result = yield* runGit(cwd, args);

        if (!isSuccessfulExitCode(result.exitCode)) {
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
        const diffResult = yield* runGit(repoRoot, diffArgs);

        if (!isSuccessfulExitCode(diffResult.exitCode)) {
          return yield* toGitCommandError(diffArgs, diffResult);
        }

        if (diffResult.stdout === "") {
          return yield* new NoStagedChangesErrorClass({ repoRoot });
        }

        const fingerprintArgs = writeTreeCommand();
        const fingerprintResult = yield* runGit(repoRoot, fingerprintArgs);

        if (!isSuccessfulExitCode(fingerprintResult.exitCode)) {
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
        const result = yield* runGit(repoRoot, args);

        if (!isSuccessfulExitCode(result.exitCode)) {
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
          return yield* new IndexChangedDuringReviewErrorClass({
            repoRoot: snapshot.repoRoot,
          });
        }

        return yield* Effect.scoped(
          Effect.gen(function* () {
            const messageFilePath = yield* fileSystem
              .makeTempFileScoped({ prefix: "gitai-commit-message-" })
              .pipe(Effect.mapError((error) => toCommitMessageFileError(error.message)));

            yield* fileSystem
              .writeFileString(messageFilePath, commitMessage)
              .pipe(Effect.mapError((error) => toCommitMessageFileError(error.message)));

            const commitArgs = commitWithFileCommand(messageFilePath);
            const commitResult = yield* runGit(snapshot.repoRoot, commitArgs);

            if (!isSuccessfulExitCode(commitResult.exitCode)) {
              return yield* toGitCommandError(commitArgs, commitResult);
            }
          }),
        );
      });

      return GitRepository.of({
        loadSnapshot,
        commitApproved,
      });
    }),
  );
}
