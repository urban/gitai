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

  it.effect("rejects invalid subjects", () =>
    Effect.gen(function* () {
      const result = yield* validateCommitMessage("Added commit workflow.").pipe(Effect.result);

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
