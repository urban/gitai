import { Effect, Schema } from "effect";

class CommitMessageValidationError extends Schema.TaggedErrorClass<CommitMessageValidationError>()(
  "CommitMessageValidationError",
  {
    message: Schema.NonEmptyString,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

class CommitMessageResponse extends Schema.Class<CommitMessageResponse>("CommitMessageResponse")({
  message: Schema.String,
}) {}

const obviousNonImperativeSubjectPattern =
  /^(Added|Adding|Adds|Changed|Changing|Changes|Fixed|Fixing|Fixes|Improved|Improving|Improves|Refactored|Refactoring|Refactors|Removed|Removing|Removes|Updated|Updating|Updates)\b/u;
const diffLikeBodyLinePatterns = [/^diff --git /u, /^index /u, /^@@ /u, /^--- /u, /^\+\+\+ /u];

const failValidation = (message: string) => new CommitMessageValidationError({ message });

const normalizeLineEndings = (message: string): string => message.replaceAll("\r\n", "\n");

const validateSubject = Effect.fn("CommitMessageRules.validateSubject")(function* (
  subject: string,
): Effect.fn.Return<void, CommitMessageValidationError> {
  if (subject.length === 0) {
    return yield* failValidation("The generated commit message is missing a subject line.");
  }

  if (subject.length >= 72) {
    return yield* failValidation(
      "The generated commit subject must be shorter than 72 characters.",
    );
  }

  if (!/^[A-Z0-9]/u.test(subject)) {
    return yield* failValidation(
      "The generated commit subject must start with a capitalized word or token.",
    );
  }

  if (subject.endsWith(".")) {
    return yield* failValidation("The generated commit subject must not end with a period.");
  }

  if (obviousNonImperativeSubjectPattern.test(subject)) {
    return yield* failValidation(
      "The generated commit subject must use an imperative verb, not a past-tense summary.",
    );
  }
});

const validateBody = Effect.fn("CommitMessageRules.validateBody")(function* (
  body: string,
): Effect.fn.Return<void, CommitMessageValidationError> {
  if (body.length === 0) {
    return yield* failValidation("The generated commit body must not be empty when present.");
  }

  if (body.startsWith("\n")) {
    return yield* failValidation(
      "The generated commit message must separate the subject and body with exactly one blank line.",
    );
  }

  const invalidLine = body
    .split("\n")
    .find((line) => diffLikeBodyLinePatterns.some((pattern) => pattern.test(line)));

  if (invalidLine === undefined) {
    return;
  }

  return yield* failValidation(
    "The generated commit body must explain the change instead of replaying raw diff output.",
  );
});

const validateCommitMessage = Effect.fn("CommitMessageRules.validateCommitMessage")(function* (
  message: string,
): Effect.fn.Return<string, CommitMessageValidationError> {
  const normalizedMessage = normalizeLineEndings(message);

  if (normalizedMessage.startsWith("\n") || normalizedMessage.endsWith("\n")) {
    return yield* failValidation(
      "The generated commit message must not start or end with a blank line.",
    );
  }

  const subjectBodySeparatorIndex = normalizedMessage.indexOf("\n\n");
  const subject =
    subjectBodySeparatorIndex === -1
      ? normalizedMessage
      : normalizedMessage.slice(0, subjectBodySeparatorIndex);
  const body =
    subjectBodySeparatorIndex === -1
      ? undefined
      : normalizedMessage.slice(subjectBodySeparatorIndex + 2);

  if (subject.includes("\n")) {
    return yield* failValidation(
      "The generated commit message must separate the subject from later sections with a blank line.",
    );
  }

  yield* validateSubject(subject);

  if (body !== undefined) {
    yield* validateBody(body);
  }

  return normalizedMessage;
});

const decodeCommitMessageResponse = Effect.fn("CommitMessageRules.decodeCommitMessageResponse")(
  function* (response: string): Effect.fn.Return<string, CommitMessageValidationError> {
    const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(CommitMessageResponse))(
      response,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new CommitMessageValidationError({
            message:
              "Codex returned invalid structured output. Expected a JSON object with a `message` string.",
            cause,
          }),
      ),
    );

    return decoded.message;
  },
);

const decodeValidatedCommitMessage = Effect.fn("CommitMessageRules.decodeValidatedCommitMessage")(
  function* (response: string): Effect.fn.Return<string, CommitMessageValidationError> {
    const message = yield* decodeCommitMessageResponse(response);
    return yield* validateCommitMessage(message);
  },
);

export {
  CommitMessageResponse,
  CommitMessageValidationError,
  decodeCommitMessageResponse,
  decodeValidatedCommitMessage,
  validateCommitMessage,
};
