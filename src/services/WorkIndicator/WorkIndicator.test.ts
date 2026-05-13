import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as Terminal from "effect/Terminal";
import { WorkIndicator } from "./WorkIndicator";

const makeTestTerminal = (writes: Array<string>): Terminal.Terminal =>
  Terminal.make({
    columns: Effect.succeed(80),
    display: (text) =>
      Effect.sync(() => {
        writes.push(text);
      }),
    readInput: Effect.never,
    readLine: Effect.never,
  });

describe("WorkIndicator", () => {
  it.effect("shows and clears a spinner with the default label while an effect runs", () =>
    Effect.gen(function* () {
      const writes: Array<string> = [];
      const TestLayer = WorkIndicator.layer.pipe(
        Layer.provide(Layer.succeed(Terminal.Terminal, makeTestTerminal(writes))),
      );

      const result = yield* Effect.gen(function* () {
        const workIndicator = yield* WorkIndicator;
        return yield* workIndicator.applyIndicator(Effect.succeed("done"));
      }).pipe(
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(TestLayer),
      );

      assert.strictEqual(result, "done");
      assert.deepStrictEqual(writes, ["\r⠋ Working...", "\r\u001B[2K\r"]);
    }),
  );

  it.effect("shows and clears a spinner with a custom label while an effect runs", () =>
    Effect.gen(function* () {
      const writes: Array<string> = [];
      const TestLayer = WorkIndicator.layer.pipe(
        Layer.provide(Layer.succeed(Terminal.Terminal, makeTestTerminal(writes))),
      );

      const result = yield* Effect.gen(function* () {
        const workIndicator = yield* WorkIndicator;
        return yield* workIndicator.applyIndicator(Effect.succeed("done"), "Thinking...");
      }).pipe(
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(TestLayer),
      );

      assert.strictEqual(result, "done");
      assert.deepStrictEqual(writes, ["\r⠋ Thinking...", "\r\u001B[2K\r"]);
    }),
  );
});
