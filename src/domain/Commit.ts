import { Schema } from "effect";

const CommitInvocationInput = Schema.Struct({
  contextLines: Schema.Number,
});

type CommitInvocationInput = typeof CommitInvocationInput.Type;

const StagedSnapshot = Schema.Struct({
  repoRoot: Schema.NonEmptyString,
  stagedPatch: Schema.NonEmptyString,
  indexFingerprint: Schema.NonEmptyString,
});

type StagedSnapshot = typeof StagedSnapshot.Type;

const CommitProposal = Schema.Struct({
  message: Schema.NonEmptyString,
});

type CommitProposal = typeof CommitProposal.Type;

const ReviewDecision = Schema.Union([
  Schema.TaggedStruct("Approve", {}),
  Schema.TaggedStruct("Reject", {}),
]);

type ReviewDecision = typeof ReviewDecision.Type;

const CommitOutcome = Schema.Union([
  Schema.TaggedStruct("Committed", {
    commitMessage: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("Rejected", {}),
]);

type CommitOutcome = typeof CommitOutcome.Type;

export {
  CommitInvocationInput,
  type CommitInvocationInput as CommitInvocationInputType,
  CommitOutcome,
  type CommitOutcome as CommitOutcomeType,
  CommitProposal,
  type CommitProposal as CommitProposalType,
  ReviewDecision,
  type ReviewDecision as ReviewDecisionType,
  StagedSnapshot,
  type StagedSnapshot as StagedSnapshotType,
};
