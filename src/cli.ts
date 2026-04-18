#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import * as Command from "effect/unstable/cli/Command";
import packageJson from "../package.json" with { type: "json" };

import { stderrRender, writeCliRender } from "./CliLogger";
import { makeCommitCommand, validateCommitCommandGrammar } from "./commands/commit";
import { CommitWorkflow } from "./services/CommitWorkflow";

export const makeCli = (cwd: string) =>
  Command.make("gitai").pipe(
    Command.withDescription("Author Git commits from staged changes"),
    Command.withSubcommands([makeCommitCommand(cwd)]),
  );

export const MainLayer = CommitWorkflow.liveLayer.pipe(Layer.provideMerge(BunServices.layer));

export const makeMain = (
  cwd: string,
  args: ReadonlyArray<string>,
): Effect.Effect<void, unknown> => {
  const grammarError = validateCommitCommandGrammar(args);

  if (grammarError !== undefined) {
    return writeCliRender(stderrRender(`ERROR\n  ${grammarError}`)).pipe(
      Effect.andThen(Effect.fail(grammarError)),
    );
  }

  return Command.runWith(makeCli(cwd), { version: packageJson.version })(args).pipe(
    Effect.provide(MainLayer),
  );
};

if (import.meta.main) {
  BunRuntime.runMain(makeMain(process.cwd(), process.argv.slice(2)), {
    disableErrorReporting: true,
  });
}
