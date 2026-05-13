import { Context, Duration, Effect, Fiber, Layer } from "effect";
import * as Terminal from "effect/Terminal";

const SPINNER_FRAMES: ReadonlyArray<string> = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = Duration.millis(80);
const DEFAULT_INDICATOR_LABEL = "Working...";
const CLEAR_SPINNER_LINE = "\r\u001B[2K\r";

const renderSpinnerFrame = (frame: string, label: string): string => `\r${frame} ${label}`;
const nextFrameIndex = (index: number): number => (index + 1) % SPINNER_FRAMES.length;

const displayIgnoringErrors =
  (terminal: Terminal.Terminal) =>
  (text: string): Effect.Effect<void> =>
    terminal.display(text).pipe(Effect.catch(() => Effect.void));

const runSpinner = (
  display: (text: string) => Effect.Effect<void>,
  label: string,
  initialFrameIndex: number,
): Effect.Effect<never> =>
  Effect.gen(function* () {
    let frameIndex = initialFrameIndex;

    for (;;) {
      yield* Effect.sleep(SPINNER_INTERVAL);
      yield* display(renderSpinnerFrame(SPINNER_FRAMES[frameIndex], label));
      frameIndex = nextFrameIndex(frameIndex);
    }
  });

class WorkIndicator extends Context.Service<
  WorkIndicator,
  {
    readonly applyIndicator: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      label?: string | undefined,
    ) => Effect.Effect<A, E, R>;
  }
>()("@urban/gitai/services/WorkIndicator/WorkIndicator") {
  static readonly layer = Layer.effect(
    WorkIndicator,
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      const display = displayIgnoringErrors(terminal);

      const applyIndicator = <A, E, R>(
        effect: Effect.Effect<A, E, R>,
        label = DEFAULT_INDICATOR_LABEL,
      ): Effect.Effect<A, E, R> =>
        Effect.acquireUseRelease(
          display(renderSpinnerFrame(SPINNER_FRAMES[0], label)).pipe(
            Effect.andThen(runSpinner(display, label, 1).pipe(Effect.forkDetach)),
          ),
          () => effect,
          (fiber) => Fiber.interrupt(fiber).pipe(Effect.andThen(display(CLEAR_SPINNER_LINE))),
        );

      return WorkIndicator.of({ applyIndicator });
    }),
  );
}

export { WorkIndicator, SPINNER_FRAMES };
