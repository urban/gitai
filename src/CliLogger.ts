import * as Console from "effect/Console";
import { Effect, Schema } from "effect";

export const CliStream = Schema.Literals(["stdout", "stderr"]);

export type CliStream = typeof CliStream.Type;

export const CliRender = Schema.Struct({
  stream: CliStream,
  text: Schema.String,
});

export type CliRender = typeof CliRender.Type;

export const stdoutRender = (text: string): CliRender => ({
  stream: "stdout",
  text,
});

export const stderrRender = (text: string): CliRender => ({
  stream: "stderr",
  text,
});

export const writeCliRender = Effect.fn("writeCliRender")(function* (render: CliRender) {
  if (render.stream === "stdout") {
    yield* Console.log(render.text);
    return;
  }

  yield* Console.error(render.text);
});
