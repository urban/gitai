import { Console, Context, Effect, Layer } from "effect";
import { WorkIndicator } from "../WorkIndicator";

class CliPresenter extends Context.Service<
  CliPresenter,
  {
    readonly log: (...message: ReadonlyArray<unknown>) => Effect.Effect<void>;
    readonly error: (...message: ReadonlyArray<unknown>) => Effect.Effect<void>;
    readonly applyIndicator: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      label?: string | undefined,
    ) => Effect.Effect<A, E, R>;
  }
>()("@urban/gitai/services/CliPresenter/CliPresenter") {
  static readonly layer = Layer.effect(
    CliPresenter,
    Effect.gen(function* () {
      const workIndicator = yield* WorkIndicator;

      return CliPresenter.of({
        log: (...message) => Console.log(...message),
        error: (...message) => Console.error(...message),
        applyIndicator: workIndicator.applyIndicator,
      });
    }),
  );
}

export { CliPresenter };
