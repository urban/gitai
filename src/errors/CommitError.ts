import { Schema } from "effect";

const CommitMessageGeneratorErrorReason = Schema.Literals([
  "prompt",
  "provider",
  "response-decode",
  "validation",
]);

type CommitMessageGeneratorErrorReason = typeof CommitMessageGeneratorErrorReason.Type;

class NotGitRepositoryError extends Schema.TaggedErrorClass<NotGitRepositoryError>()(
  "NotGitRepositoryError",
  {
    cwd: Schema.String,
  },
) {}

class NoStagedChangesError extends Schema.TaggedErrorClass<NoStagedChangesError>()(
  "NoStagedChangesError",
  {
    repoRoot: Schema.String,
  },
) {}

class CommitMessageGeneratorError extends Schema.TaggedErrorClass<CommitMessageGeneratorError>()(
  "CommitMessageGeneratorError",
  {
    reason: CommitMessageGeneratorErrorReason,
    message: Schema.NonEmptyString,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

class IndexChangedDuringReviewError extends Schema.TaggedErrorClass<IndexChangedDuringReviewError>()(
  "IndexChangedDuringReviewError",
  {
    repoRoot: Schema.String,
  },
) {}

class GitCommandError extends Schema.TaggedErrorClass<GitCommandError>()("GitCommandError", {
  command: Schema.NonEmptyArray(Schema.String),
  message: Schema.NonEmptyString,
  exitCode: Schema.optional(Schema.Number),
}) {}

type CommitOperationalError =
  | NotGitRepositoryError
  | NoStagedChangesError
  | CommitMessageGeneratorError
  | IndexChangedDuringReviewError
  | GitCommandError;

const formatCommitOperationalError = (error: CommitOperationalError): string => {
  switch (error._tag) {
    case "NotGitRepositoryError":
      return "Not inside a git repository";
    case "NoStagedChangesError":
      return "No staged changes found";
    case "CommitMessageGeneratorError":
      return error.message;
    case "IndexChangedDuringReviewError":
      return "Staged changes changed during review";
    case "GitCommandError":
      return error.message;
  }
};

export {
  CommitMessageGeneratorError,
  CommitMessageGeneratorErrorReason,
  type CommitMessageGeneratorErrorReason as CommitMessageGeneratorErrorReasonType,
  type CommitOperationalError,
  formatCommitOperationalError,
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
};
