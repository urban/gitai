#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Option } from "effect";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import packageJson from "../package.json" with { type: "json" };
import { decodeCommitInvocationInput } from "./commit/contracts.ts";

const runCommitCommand = Effect.fn("runCommitCommand")(function* (input: {
  readonly instruction?: string;
}) {
  yield* Effect.sync(() => decodeCommitInvocationInput(input));
});

const commit = Command.make(
  "commit",
  {
    instruction: Argument.string("instruction").pipe(Argument.optional),
  },
  ({ instruction }) => {
    const value = Option.getOrUndefined(instruction);

    return value === undefined ? runCommitCommand({}) : runCommitCommand({ instruction: value });
  },
).pipe(Command.withDescription("Generate a commit proposal from the staged diff"));

export const cli = Command.make("gitai").pipe(
  Command.withDescription("Author Git commits from staged changes"),
  Command.withSubcommands([commit]),
);

const validateCommitGrammar = (args: ReadonlyArray<string>): string | undefined => {
  if (args[0] !== "commit") {
    return undefined;
  }

  return args.length <= 2
    ? undefined
    : "gitai commit accepts zero or one optional instruction string";
};

const args = process.argv.slice(2);
const grammarError = validateCommitGrammar(args);

if (grammarError !== undefined) {
  console.error(`ERROR\n  ${grammarError}`);
  process.exit(1);
}

const main = Command.runWith(cli, { version: packageJson.version })(args).pipe(
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(main);
