import { Context, Effect, Fiber, FileSystem, Layer, PlatformError, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { type StagedSnapshotType } from "../../domain/Commit";
import {
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
} from "../../errors/CommitError";
import { filterIgnoredDiffSections, getIgnoredDiffSectionHeaders } from "./ignoredDiffSections";

type GitCommand = readonly [string, ...string[]];

type GitProcessResult = Readonly<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;

const gitCommand = (args: GitCommand): [string, ...Array<string>] => ["git", ...args];

const trimTrailingNewlines = (value: string): string => value.replace(/\n+$/u, "");

const formatGitFailureMessage = (result: GitProcessResult): string => {
  const stderr = result.stderr.trim();

  if (stderr.length > 0) {
    return stderr;
  }

  const stdout = result.stdout.trim();

  return stdout.length > 0 ? stdout : "git command failed";
};

const toGitCommandError = (args: GitCommand, result: GitProcessResult): GitCommandError =>
  new GitCommandError({
    command: gitCommand(args),
    message: formatGitFailureMessage(result),
    exitCode: result.exitCode,
  });

const toGitCommandErrorFromPlatform = (
  args: GitCommand,
  error: PlatformError.PlatformError,
): GitCommandError =>
  new GitCommandError({
    command: gitCommand(args),
    message: error.message,
  });

const isNotGitRepositoryFailure = (result: GitProcessResult): boolean =>
  result.exitCode === 128 && /not a git repository/u.test(result.stderr);

const revParseShowToplevelCommand = (): GitCommand => ["rev-parse", "--show-toplevel"];
const stagedDiffCommand = (contextLines: number): GitCommand => [
  "diff",
  "--cached",
  "--no-ext-diff",
  "--binary",
  `-U${contextLines}`,
];
const writeTreeCommand = (): GitCommand => ["write-tree"];
const commitWithFileCommand = (messageFilepath: string): GitCommand => [
  "commit",
  "--cleanup=verbatim",
  "--file",
  messageFilepath,
];
const commitWithTempFileCommand = (): GitCommand => [
  "commit",
  "--cleanup=verbatim",
  "--file",
  "<temp-message-file>",
];

class GitRepository extends Context.Service<
  GitRepository,
  {
    readonly loadSnapshot: (
      cwd: string,
      contextLines: number,
    ) => Effect.Effect<
      StagedSnapshotType,
      NotGitRepositoryError | NoStagedChangesError | GitCommandError
    >;
    readonly commitApproved: (
      snapshot: StagedSnapshotType,
      commitMessage: string,
    ) => Effect.Effect<void, IndexChangedDuringReviewError | GitCommandError>;
  }
>()("@urban/gitai/services/GitRepository/GitRepository") {
  static readonly layer = Layer.effect(
    GitRepository,
    Effect.gen(function* () {
      const executor = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;

      const makeGitCommand = (cwd: string, args: GitCommand) =>
        ChildProcess.make("git", args, {
          cwd,
          stderr: "pipe",
          stdout: "pipe",
        });

      const runGit = Effect.fn("GitRepository.runGit")(
        function* (
          cwd: string,
          args: GitCommand,
        ): Effect.fn.Return<GitProcessResult, GitCommandError> {
          yield* Effect.logDebug("Running git command", {
            command: gitCommand(args).join(" "),
            cwd,
          });

          return yield* Effect.scoped(
            Effect.gen(function* () {
              const process = yield* executor
                .spawn(makeGitCommand(cwd, args))
                .pipe(Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)));

              const stdoutFiber = yield* process.stdout.pipe(
                Stream.decodeText(),
                Stream.runCollect,
                Effect.map((chunks) => chunks.join("")),
                Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)),
                Effect.forkScoped,
              );

              const stderrFiber = yield* process.stderr.pipe(
                Stream.decodeText(),
                Stream.runCollect,
                Effect.map((chunks) => chunks.join("")),
                Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)),
                Effect.forkScoped,
              );

              const [exitCode, stdout, stderr] = yield* Effect.all(
                [
                  process.exitCode.pipe(
                    Effect.mapError((error) => toGitCommandErrorFromPlatform(args, error)),
                  ),
                  Fiber.join(stdoutFiber),
                  Fiber.join(stderrFiber),
                ],
                { concurrency: "unbounded" },
              );

              yield* Effect.logDebug("Git command completed", {
                command: gitCommand(args).join(" "),
                exitCode,
                stderrBytes: stderr.length,
                stdoutBytes: stdout.length,
              });

              return { exitCode, stderr, stdout };
            }),
          );
        },
        Effect.annotateLogs({ service: "GitRepository" }),
      );

      const resolveRepoRoot = Effect.fn("GitRepository.resolveRepoRoot")(function* (
        cwd: string,
      ): Effect.fn.Return<string, NotGitRepositoryError | GitCommandError> {
        const args = revParseShowToplevelCommand();
        const result = yield* runGit(cwd, args);

        if (result.exitCode === 0) {
          const repoRoot = trimTrailingNewlines(result.stdout);
          yield* Effect.logDebug("Resolved git repository root", { repoRoot });
          return repoRoot;
        }

        if (isNotGitRepositoryFailure(result)) {
          return yield* new NotGitRepositoryError({ cwd });
        }

        return yield* toGitCommandError(args, result);
      });

      const loadCurrentFingerprint = Effect.fn("GitRepository.loadCurrentFingerprint")(function* (
        repoRoot: string,
      ): Effect.fn.Return<string, GitCommandError> {
        const args = writeTreeCommand();
        const result = yield* runGit(repoRoot, args);

        if (result.exitCode !== 0) {
          return yield* toGitCommandError(args, result);
        }

        return trimTrailingNewlines(result.stdout);
      });

      const loadSnapshot = Effect.fn("GitRepository.loadSnapshot")(function* (
        cwd: string,
        contextLines: number,
      ): Effect.fn.Return<
        StagedSnapshotType,
        NotGitRepositoryError | NoStagedChangesError | GitCommandError
      > {
        const repoRoot = yield* resolveRepoRoot(cwd);
        const diffArgs = stagedDiffCommand(contextLines);
        const diffResult = yield* runGit(repoRoot, diffArgs);

        if (diffResult.exitCode !== 0) {
          return yield* toGitCommandError(diffArgs, diffResult);
        }

        const stagedPatch = filterIgnoredDiffSections(diffResult.stdout);
        const ignoredHeaders = getIgnoredDiffSectionHeaders(diffResult.stdout);

        yield* Effect.logDebug("Loaded staged diff", {
          contextLines,
          filteredBytes: stagedPatch.length,
          ignoredFileCount: ignoredHeaders.length,
          rawBytes: diffResult.stdout.length,
        });
        yield* Effect.forEach(ignoredHeaders, (header) =>
          Effect.logDebug("Ignored diff file", { header }),
        );

        if (stagedPatch.trim().length === 0) {
          yield* Effect.logDebug("No staged changes remain after filtering", { repoRoot });
          return yield* new NoStagedChangesError({ repoRoot });
        }

        const indexFingerprint = yield* loadCurrentFingerprint(repoRoot);
        yield* Effect.logDebug("Loaded staged index fingerprint", { indexFingerprint });

        return {
          indexFingerprint,
          repoRoot,
          stagedPatch,
        };
      });

      const commitApproved = Effect.fn("GitRepository.commitApproved")(
        function* (
          snapshot: StagedSnapshotType,
          commitMessage: string,
        ): Effect.fn.Return<void, IndexChangedDuringReviewError | GitCommandError> {
          yield* Effect.logDebug("Verifying staged index fingerprint before commit", {
            repoRoot: snapshot.repoRoot,
          });
          const currentFingerprint = yield* loadCurrentFingerprint(snapshot.repoRoot);

          if (currentFingerprint !== snapshot.indexFingerprint) {
            yield* Effect.logDebug("Staged index fingerprint changed", {
              currentFingerprint,
              expectedFingerprint: snapshot.indexFingerprint,
              repoRoot: snapshot.repoRoot,
            });
            return yield* new IndexChangedDuringReviewError({ repoRoot: snapshot.repoRoot });
          }

          return yield* Effect.scoped(
            Effect.gen(function* () {
              const messageFilepath = yield* fs
                .makeTempFileScoped({ prefix: "gitai-commit-message-" })
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new GitCommandError({
                        command: gitCommand(commitWithTempFileCommand()),
                        message: error.message,
                      }),
                  ),
                );

              yield* Effect.logDebug("Writing commit message file", {
                messageBytes: commitMessage.length,
                messageFilepath,
              });
              yield* fs.writeFileString(messageFilepath, commitMessage).pipe(
                Effect.mapError(
                  (error) =>
                    new GitCommandError({
                      command: gitCommand(commitWithTempFileCommand()),
                      message: error.message,
                    }),
                ),
              );

              const commitArgs = commitWithFileCommand(messageFilepath);
              const commitResult = yield* runGit(snapshot.repoRoot, commitArgs);

              if (commitResult.exitCode !== 0) {
                return yield* toGitCommandError(commitArgs, commitResult);
              }

              yield* Effect.logDebug("Git commit command completed successfully", {
                repoRoot: snapshot.repoRoot,
              });
            }),
          );
        },
        Effect.annotateLogs({ service: "GitRepository" }),
      );

      return GitRepository.of({
        commitApproved,
        loadSnapshot,
      });
    }),
  );
}

export { GitRepository };
