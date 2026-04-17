import { Schema } from "effect";

import type { CommitOutcome } from "./contracts.ts";
import { formatCommitOperationalError, type CommitOperationalError } from "./errors.ts";

export const TerminalStream = Schema.Literals(["stdout", "stderr"]);

export type TerminalStream = typeof TerminalStream.Type;

export const TerminalRender = Schema.Struct({
  stream: TerminalStream,
  text: Schema.String,
});

export type TerminalRender = typeof TerminalRender.Type;

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
