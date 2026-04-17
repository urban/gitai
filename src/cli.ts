import { Effect, Option } from "effect";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";

import { decodeCommitInvocationInput } from "./commit/contracts.ts";
import {
  renderCommitOperationalError,
  renderCommitOutcome,
  writeTerminalRender,
} from "./commit/terminal.ts";
import { CommitWorkflow } from "./commit/workflow.ts";

export const runCommitCommand = Effect.fn("runCommitCommand")(function* (
  cwd: string,
  input: {
    readonly instruction?: string;
  },
) {
  const workflow = yield* CommitWorkflow;
  const invocationInput = yield* Effect.sync(() => decodeCommitInvocationInput(input));
  const rendered = yield* workflow.run(cwd, invocationInput).pipe(
    Effect.match({
      onFailure: renderCommitOperationalError,
      onSuccess: renderCommitOutcome,
    }),
  );

  yield* writeTerminalRender(rendered);
});

const makeCommitCommand = (cwd: string) =>
  Command.make(
    "commit",
    {
      instruction: Argument.string("instruction").pipe(Argument.optional),
    },
    ({ instruction }) => {
      const value = Option.getOrUndefined(instruction);

      return value === undefined
        ? runCommitCommand(cwd, {})
        : runCommitCommand(cwd, { instruction: value });
    },
  ).pipe(Command.withDescription("Generate a commit proposal from the staged diff"));

export const makeCli = (cwd: string) =>
  Command.make("gitai").pipe(
    Command.withDescription("Author Git commits from staged changes"),
    Command.withSubcommands([makeCommitCommand(cwd)]),
  );

export const validateCommitGrammar = (args: ReadonlyArray<string>): string | undefined => {
  if (args[0] !== "commit") {
    return undefined;
  }

  return args.length <= 2
    ? undefined
    : "gitai commit accepts zero or one optional instruction string";
};
