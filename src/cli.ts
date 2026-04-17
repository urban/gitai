#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import * as Command from "effect/unstable/cli/Command";
import packageJson from "../package.json" with { type: "json" };

import { makeCommitCommand, validateCommitCommandGrammar } from "./commands/commit.ts";
import { CommitWorkflow } from "./services/CommitWorkflow.ts";

export const makeCli = (cwd: string) =>
  Command.make("gitai").pipe(
    Command.withDescription("Author Git commits from staged changes"),
    Command.withSubcommands([makeCommitCommand(cwd)]),
  );

export const MainLayer = CommitWorkflow.liveLayer.pipe(Layer.provideMerge(BunServices.layer));

export const makeMain = (cwd: string) =>
  makeCli(cwd).pipe(Command.run({ version: packageJson.version }), Effect.provide(MainLayer));

if (import.meta.main) {
  const args = process.argv.slice(2);
  const grammarError = validateCommitCommandGrammar(args);

  if (grammarError !== undefined) {
    console.error(`ERROR\n  ${grammarError}`);
    process.exit(1);
  }

  BunRuntime.runMain(makeMain(process.cwd()));
}
