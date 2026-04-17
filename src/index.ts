#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import * as Command from "effect/unstable/cli/Command";
import packageJson from "../package.json" with { type: "json" };
import { CommitWorkflow } from "./commit/workflow.ts";
import { makeCli, validateCommitGrammar } from "./cli.ts";

const args = process.argv.slice(2);
const grammarError = validateCommitGrammar(args);

if (grammarError !== undefined) {
  console.error(`ERROR\n  ${grammarError}`);
  process.exit(1);
}

const cli = makeCli(process.cwd());

const main = Command.runWith(cli, { version: packageJson.version })(args).pipe(
  Effect.provide(CommitWorkflow.liveLayer),
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(main);
