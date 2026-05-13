import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { CliAgent } from "../CliAgent";
import { CliPresenter } from "../CliPresenter";
import { CommitMessageGenerator } from "./CommitMessageGenerator";
import { Templater } from "../Templater";

const TestLayer = CommitMessageGenerator.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.succeed(
        CliAgent,
        CliAgent.of({
          command: () => Effect.succeed('{"message":"Add commit generator"}'),
        }),
      ),
      Layer.succeed(
        Templater,
        Templater.of({
          compile: () => Effect.succeed("prompt"),
          load: () => Effect.succeed("template"),
        }),
      ),
      Layer.succeed(
        CliPresenter,
        CliPresenter.of({
          error: () => Effect.void,
          log: () => Effect.void,
          applyIndicator: (effect) => effect,
        }),
      ),
    ),
  ),
);

describe("CommitMessageGenerator", () => {
  it.effect("generates and validates a commit proposal", () =>
    Effect.gen(function* () {
      const generator = yield* CommitMessageGenerator;
      const proposal = yield* generator.generate({
        indexFingerprint: "fingerprint",
        repoRoot: "/repo",
        stagedPatch: "diff",
      });

      assert.strictEqual(proposal.message, "Add commit generator");
    }).pipe(
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(TestLayer),
    ),
  );
});
