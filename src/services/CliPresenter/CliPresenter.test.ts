import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { WorkIndicator } from "../WorkIndicator";
import { CliPresenter } from "./CliPresenter";

const makeWorkIndicatorLayer = (labels: Array<string>) =>
  Layer.succeed(
    WorkIndicator,
    WorkIndicator.of({
      applyIndicator: (effect, label) =>
        Effect.sync(() => {
          labels.push(label ?? "Working...");
        }).pipe(Effect.andThen(effect)),
    }),
  );

describe("CliPresenter", () => {
  it.effect("applies the work indicator for spinner presentation", () =>
    Effect.gen(function* () {
      const labels: Array<string> = [];
      const TestLayer = CliPresenter.layer.pipe(Layer.provide(makeWorkIndicatorLayer(labels)));

      const result = yield* Effect.gen(function* () {
        const presenter = yield* CliPresenter;
        return yield* presenter.applyIndicator(Effect.succeed("done"));
      }).pipe(
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(TestLayer),
      );

      assert.strictEqual(result, "done");
      assert.deepStrictEqual(labels, ["Working..."]);
    }),
  );
});
