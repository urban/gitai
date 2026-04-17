import * as Console from "effect/Console";
import { Effect, Schema } from "effect";

import { type CommitOutcome, type CommitProposal, renderCommitMessage } from "./contracts.ts";
import { formatCommitOperationalError, type CommitOperationalError } from "./errors.ts";

export const TerminalStream = Schema.Literals(["stdout", "stderr"]);

export type TerminalStream = typeof TerminalStream.Type;

export const TerminalRender = Schema.Struct({
  stream: TerminalStream,
  text: Schema.String,
});

export type TerminalRender = typeof TerminalRender.Type;

export const renderCommitProposal = (proposal: CommitProposal): TerminalRender => ({
  stream: "stdout",
  text: `Proposed commit message:\n\n${renderCommitMessage(proposal)}`,
});

export const renderCommitOutcome = (outcome: CommitOutcome): TerminalRender => {
  switch (outcome._tag) {
    case "Committed":
      return {
        stream: "stdout",
        text: `Committed with message:\n\n${outcome.commitMessage}`,
      };
    case "Rejected":
      return {
        stream: "stdout",
        text: "Commit aborted without creating a commit.",
      };
  }
};

export const renderCommitOperationalError = (error: CommitOperationalError): TerminalRender => ({
  stream: "stderr",
  text: `ERROR\n  ${formatCommitOperationalError(error)}`,
});

export const writeTerminalRender = Effect.fn("writeTerminalRender")(function* (
  render: TerminalRender,
) {
  if (render.stream === "stdout") {
    yield* Console.log(render.text);
    return;
  }

  yield* Console.error(render.text);
});
