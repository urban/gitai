#!/usr/bin/env bun

import { BunServices, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Logger } from "effect";
import { Command } from "effect/unstable/cli";
import pkg from "../package.json" with { type: "json" };
import { commandCommit } from "./commands/commit";
import { CliAgent } from "./services/CliAgent";
import { GitClient } from "./services/GitClient";
import { AiGenerator } from "./services/AiGenerator";
import { Templater } from "./services/Templater";
import { cliLogger } from "./CliLogger";

const cli = Command.make("gitai");

const MainLayer = Layer.mergeAll(
  GitClient.layer,
  AiGenerator.layer,
  Logger.layer([cliLogger]),
).pipe(
  Layer.provideMerge(CliAgent.layer),
  Layer.provideMerge(Templater.layer),
  Layer.provideMerge(BunServices.layer),
);

if (import.meta.main) {
  cli.pipe(
    Command.withSubcommands([commandCommit]),
    Command.run({
      version: pkg.version,
    }),
    Effect.provide(MainLayer),
    BunRuntime.runMain,
  );
}
