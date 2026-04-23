// import { Command, CommandExecutor, Error } from "@effect/platform";
import { BunServices } from "@effect/platform-bun";
import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  PlatformError,
  Schema,
  SchemaTransformation,
  SchemaIssue,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const IGNORE_PATTERNS = [
  /pnpm-lock\.yaml/,
  /yarn\.lock/,
  /package-lock\.json/,
  /bun\.lockb?/,
  /coverage\/.*\.json/,
  /node_modules\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /\.git\//,
  /\.DS_Store/,
];

const GitCommit = Schema.Struct({
  hash: Schema.NonEmptyString,
  shortHash: Schema.NonEmptyString,
  subject: Schema.String,
  body: Schema.String,
  author: Schema.String,
  date: Schema.String,
});

class GitCommandError extends Schema.TaggedErrorClass<GitCommandError>()("GitCommandError", {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

const gitLogDelimiter = "\u0000"; // null byte character
const gitFieldSeparator = "\u001f"; // ASCII Unit Separator
const gitLogFormat = [
  "%H", // hash
  "%h", // short hash
  "%s", // subject
  "%b", // body
  "%an", // author
  "%ad", // author date
  "%x00", // null byte character
].join("%x1f"); // field separator

const GitLogCommits = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Array(GitCommit),
    SchemaTransformation.transformOrFail<ReadonlyArray<typeof GitCommit.Type>, string>({
      decode: (output) =>
        Effect.sync(() =>
          output
            .split(gitLogDelimiter)
            .filter((chunk) => chunk.trim() !== "")
            .map((chunk) => {
              const lines = chunk.trim().split(gitFieldSeparator);
              return Schema.decodeSync(GitCommit)({
                hash: lines[0] ?? "",
                shortHash: lines[1] ?? "",
                subject: lines[2] ?? "",
                body: (lines[3] ?? "").trim(),
                author: lines[4] ?? "",
                date: lines[5] ?? "",
              });
            }),
        ),
      encode: (_value, _options) =>
        Effect.fail(
          new SchemaIssue.Forbidden(Option.none(), { message: "Encoding not supported" }),
        ),
    }),
  ),
);

const makeLogCommand = (...args: ReadonlyArray<string>) =>
  ChildProcess.make("git", [
    "log",
    `--format=${gitLogFormat}`,
    "--no-color",
    "--date=iso-strict",
    ...args,
  ]);

class GitClient extends Context.Service<
  GitClient,
  {
    readonly commit: (message: string) => Effect.Effect<void, PlatformError.PlatformError, never>;
    readonly filterDiff: (diff: string) => Effect.Effect<string>;
    readonly getDiff: (
      contextLines: number,
      hasRange: string,
    ) => Effect.Effect<string, GitCommandError>;
    readonly getStagedDiff: (contextLines: number) => Effect.Effect<string, GitCommandError>;
    readonly getCommitRange: (
      fromHash: string,
      toHash?: string | undefined,
    ) => Effect.Effect<ReadonlyArray<typeof GitCommit.Type>, GitCommandError>;
    readonly getAllCommits: (
      limit?: number | undefined,
    ) => Effect.Effect<ReadonlyArray<typeof GitCommit.Type>, GitCommandError>;
  }
>()("@gitai/GitClient") {
  static readonly layer = Layer.effect(
    GitClient,
    Effect.gen(function* () {
      // TODO create AppConfig
      const isDebug = yield* Config.boolean("DEBUG").pipe(Config.withDefault(false));
      const executor = yield* ChildProcessSpawner.ChildProcessSpawner;

      const run = (cmd: ChildProcess.Command) =>
        executor.string(cmd).pipe(
          Effect.map((s) => s.trim()),
          Effect.mapError(
            (cause) =>
              new GitCommandError({
                message: "Failed to execute git command",
                cause,
              }),
          ),
        );

      const runLog = (...args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const cmd = makeLogCommand(...args);
          const response = yield* run(cmd);
          const output = yield* Schema.decodeEffect(GitLogCommits)(response);
          return output;
        }).pipe(
          Effect.mapError(
            (cause) =>
              new GitCommandError({
                message: "Failed to decode commit history",
                cause,
              }),
          ),
        );

      const commit = Effect.fn("GitClient.commit")(function* (message: string) {
        const commitCommand = ChildProcess.make("git", ["commit", "-m", message]);
        const handle = yield* executor.spawn(commitCommand);
        const exitCode = yield* handle.exitCode;
        if (exitCode !== 0) {
          return yield* Effect.die(
            new Error(`Failed to commit. 'git' command exited with code: ${exitCode}`),
          );
        } else {
          return yield* Effect.void;
        }
      }, Effect.scoped);

      const filterDiff = Effect.fn("GitClient.filterDiff")(function* (diff: string) {
        // TODO: Use Schema to decode the diff, then filter the out ignored files and finally, re-encode the diff
        const parts = diff
          .split("diff --git")
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        const getHeaderLine = (part: string) => {
          const firstNewline = part.indexOf("\n");
          return firstNewline === -1 ? part : part.substring(0, firstNewline);
        };
        const isIgnored = (part: string) =>
          IGNORE_PATTERNS.some((pattern) => pattern.test(getHeaderLine(part)));

        const ignoredFiles = parts.filter(isIgnored);
        const files = parts.filter((part) => !isIgnored(part));

        if (isDebug) {
          yield* Effect.forEach(ignoredFiles, (file) => {
            const firstLine = getHeaderLine(file);
            // TODO: log ignored filepath instead of diff header
            return Effect.log(`Ignored diff file: ${firstLine}`);
          });
        }

        const filteredRawDiff = files.map((part) => `diff --git${part}`).join("");
        return filteredRawDiff;
      });

      const getDiff = Effect.fn("GitClient.getDiff")(function* (
        contextLines: number,
        hasRange: string,
      ) {
        const cmd = ChildProcess.make("git", ["diff", `-U${contextLines}`, hasRange]);
        const rawDiff = yield* run(cmd);
        return rawDiff;
      });

      const getStagedDiff = Effect.fn("GitClient.getStagedDiff")(function* (contextLines: number) {
        const cmd = ChildProcess.make("git", ["diff", "--staged", `-U${contextLines}`]);
        const rawDiff = yield* run(cmd);
        return rawDiff;
      });

      const getCommitRange = Effect.fn("GitClient.getCommitRange")(function* (
        fromHash: string,
        toHash: string = "HEAD",
      ) {
        const commits = yield* runLog(`${fromHash}..${toHash}`);
        return commits;
      });

      const getAllCommits = Effect.fn("GitClient.getAllCommits")(function* (limit: number = 50) {
        const commits = yield* runLog(`-n${limit}`);
        return commits;
      });

      return GitClient.of({
        commit,
        filterDiff,
        getDiff,
        getStagedDiff,
        getCommitRange,
        getAllCommits,
      });
    }),
  ).pipe(Layer.provide(BunServices.layer));
}

export { GitClient, GitCommandError, GitCommit };
