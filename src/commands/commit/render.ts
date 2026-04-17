import { stderrRender, stdoutRender, type CliRender } from "../../CliLogger.ts";
import {
  type CommitOutcome,
  type CommitProposal,
  renderCommitMessage,
} from "../../domain/Commit.ts";
import {
  formatCommitOperationalError,
  type CommitOperationalError,
} from "../../errors/CommitError.ts";

export const renderCommitProposal = (proposal: CommitProposal): CliRender =>
  stdoutRender(`Proposed commit message:\n\n${renderCommitMessage(proposal)}`);

export const renderCommitOutcome = (outcome: CommitOutcome): CliRender => {
  switch (outcome._tag) {
    case "Committed":
      return stdoutRender(`Committed with message:\n\n${outcome.commitMessage}`);
    case "Rejected":
      return stdoutRender("Commit aborted without creating a commit.");
  }
};

export const renderCommitOperationalError = (error: CommitOperationalError): CliRender =>
  stderrRender(`ERROR\n  ${formatCommitOperationalError(error)}`);
