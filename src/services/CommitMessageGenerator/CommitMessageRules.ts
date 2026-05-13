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
const failValidation = (message: string) => new CommitMessageValidationError({ message });

const normalizeLineEndings = (message: string): string => message.replaceAll("\r\n", "\n");

const splitCommitMessage = (
  message: string,
): { readonly subject: string; readonly body: string | undefined } => {
  const firstLineBreakIndex = message.indexOf("\n");

  return firstLineBreakIndex === -1
    ? { subject: message, body: undefined }
    : {
        subject: message.slice(0, firstLineBreakIndex),
        body: message.slice(firstLineBreakIndex + 1).trim(),
      };
};

const formatCommitMessage = (subject: string, body: string | undefined): string =>
  body === undefined || body.length === 0 ? subject : `${subject}\n\n${body}`;

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

const validateCommitMessage = Effect.fn("CommitMessageRules.validateCommitMessage")(function* (
  message: string,
): Effect.fn.Return<string, CommitMessageValidationError> {
  const { body, subject } = splitCommitMessage(normalizeLineEndings(message));

  yield* validateSubject(subject);

  return formatCommitMessage(subject, body);
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
