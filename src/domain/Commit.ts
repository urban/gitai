import { Context, Schema } from "effect";

export const CommitInvocationInput = Schema.Struct({
  instruction: Schema.optionalKey(Schema.String),
});

export type CommitInvocationInput = typeof CommitInvocationInput.Type;

export const decodeCommitInvocationInput = Schema.decodeUnknownSync(CommitInvocationInput);

export const StagedSnapshot = Schema.Struct({
  repoRoot: Schema.String,
  stagedPatch: Schema.String,
  indexFingerprint: Schema.String,
});

export type StagedSnapshot = typeof StagedSnapshot.Type;

export const CommitProposal = Schema.Struct({
  summary: Schema.NonEmptyString,
  body: Schema.optionalKey(Schema.NonEmptyString),
});

export type CommitProposal = typeof CommitProposal.Type;

export const renderCommitMessage = (proposal: CommitProposal): string =>
  proposal.body === undefined ? proposal.summary : `${proposal.summary}\n\n${proposal.body}`;

export const ReviewDecision = Schema.Union([
  Schema.TaggedStruct("Approve", {}),
  Schema.TaggedStruct("Reject", {}),
]);

export type ReviewDecision = typeof ReviewDecision.Type;

export const CommitOutcome = Schema.Union([
  Schema.TaggedStruct("Committed", {
    commitMessage: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("Rejected", {}),
]);

export type CommitOutcome = typeof CommitOutcome.Type;

export const ReasoningEffort = Schema.Literals(["low", "medium", "high", "xhigh"]);

export type ReasoningEffort = typeof ReasoningEffort.Type;

export const GitAiConfig = Schema.Struct({
  model: Schema.NonEmptyString,
  reasoningEffort: ReasoningEffort,
});

export type GitAiConfig = typeof GitAiConfig.Type;

export const defaultGitAiConfig: GitAiConfig = {
  model: "gpt-5.4",
  reasoningEffort: "medium",
};

export const GitAiConfigReference = Context.Reference<GitAiConfig>(
  "@urban/gitai/domain/Commit/GitAiConfig",
  {
    defaultValue: () => ({ ...defaultGitAiConfig }),
  },
);
