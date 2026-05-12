import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { decodeValidatedCommitMessage, validateCommitMessage } from "./CommitMessageRules";

describe("CommitMessageRules", () => {
  it.effect("accepts a valid commit message", () =>
    Effect.gen(function* () {
      const result = yield* validateCommitMessage("Add commit workflow");

      assert.strictEqual(result, "Add commit workflow");
    }),
  );

  it.effect("accepts a valid commit message with a body", () =>
    Effect.gen(function* () {
      const message = "Add commit workflow\n\nDocument the staged diff review flow";
      const result = yield* validateCommitMessage(message);

      assert.strictEqual(result, message);
    }),
  );

  it.effect("rejects invalid subjects", () =>
    Effect.gen(function* () {
      const result = yield* validateCommitMessage("Added commit workflow.").pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
    }),
  );

  it.effect("accepts a valid commit message with multiple body paragraphs", () =>
    Effect.gen(function* () {
      const message =
        "Add commit workflow\n\nDocument the staged diff review flow\n\nExplain why approval happens before commit";
      const result = yield* validateCommitMessage(message);

      assert.strictEqual(result, message);
    }),
  );

  it.effect("rejects body separated from subject by more than one blank line", () =>
    Effect.gen(function* () {
      const message = "Add commit workflow\n\n\nDocument the staged diff review flow";
      const result = yield* validateCommitMessage(message).pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
    }),
  );

  it.effect("rejects empty generated messages", () =>
    Effect.gen(function* () {
      const result = yield* decodeValidatedCommitMessage('{"message":""}').pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
    }),
  );
});
