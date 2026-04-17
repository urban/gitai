import { Schema } from "effect";

export const CommitMessageGeneratorErrorReason = Schema.Literals([
  "provider",
  "model",
  "response-decode",
]);

export type CommitMessageGeneratorErrorReason = typeof CommitMessageGeneratorErrorReason.Type;

export class NotGitRepositoryError extends Schema.TaggedErrorClass<NotGitRepositoryError>()(
  "NotGitRepositoryError",
  {
    cwd: Schema.String,
  },
) {}

export class NoStagedChangesError extends Schema.TaggedErrorClass<NoStagedChangesError>()(
  "NoStagedChangesError",
  {
    repoRoot: Schema.String,
  },
) {}

export class CommitMessageGeneratorError extends Schema.TaggedErrorClass<CommitMessageGeneratorError>()(
  "CommitMessageGeneratorError",
  {
    reason: CommitMessageGeneratorErrorReason,
    message: Schema.NonEmptyString,
  },
) {}

export class IndexChangedDuringReviewError extends Schema.TaggedErrorClass<IndexChangedDuringReviewError>()(
  "IndexChangedDuringReviewError",
  {
    repoRoot: Schema.String,
  },
) {}

export class GitCommandError extends Schema.TaggedErrorClass<GitCommandError>()("GitCommandError", {
  command: Schema.NonEmptyArray(Schema.String),
  message: Schema.NonEmptyString,
  exitCode: Schema.optionalKey(Schema.Number),
}) {}

export type CommitOperationalError =
  | NotGitRepositoryError
  | NoStagedChangesError
  | CommitMessageGeneratorError
  | IndexChangedDuringReviewError
  | GitCommandError;

export const formatCommitOperationalError = (error: CommitOperationalError): string => {
  switch (error._tag) {
    case "NotGitRepositoryError":
      return `Current directory is not inside a Git repository: ${error.cwd}`;
    case "NoStagedChangesError":
      return `No staged changes were found in ${error.repoRoot}`;
    case "CommitMessageGeneratorError":
      return `Commit message generation failed (${error.reason}): ${error.message}`;
    case "IndexChangedDuringReviewError":
      return `Staged changes changed during review in ${error.repoRoot}`;
    case "GitCommandError": {
      const exitCode = error.exitCode === undefined ? "" : ` (exit code ${error.exitCode})`;

      return `Git command failed${exitCode}: ${error.command.join(" ")}\n${error.message}`;
    }
  }
};
