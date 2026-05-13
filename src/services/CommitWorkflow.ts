import { Context, Effect, Layer } from "effect";
import { type CommitInvocationInputType, type CommitOutcomeType } from "../domain/Commit";
import { type CommitOperationalError } from "../errors/CommitError";
import { CommitMessageGenerator } from "./CommitMessageGenerator";
import { CommitReview } from "./CommitReview";
import { GitRepository } from "./GitRepository";

class CommitWorkflow extends Context.Service<
  CommitWorkflow,
  {
    readonly run: (
      input: CommitInvocationInputType,
    ) => Effect.Effect<CommitOutcomeType, CommitOperationalError>;
  }
>()("@urban/gitai/services/CommitWorkflow") {
  static readonly layer = Layer.effect(
    CommitWorkflow,
    Effect.gen(function* () {
      const repository = yield* GitRepository;
      const generator = yield* CommitMessageGenerator;
      const review = yield* CommitReview;

      const run = Effect.fn("CommitWorkflow.run")(
        function* (
          input: CommitInvocationInputType,
        ): Effect.fn.Return<CommitOutcomeType, CommitOperationalError> {
          yield* Effect.logDebug("Loading staged snapshot", { contextLines: input.contextLines });
          const snapshot = yield* repository.loadSnapshot(".", input.contextLines);
          yield* Effect.logDebug("Loaded staged snapshot", {
            repoRoot: snapshot.repoRoot,
            stagedPatchBytes: snapshot.stagedPatch.length,
          });

          yield* Effect.logDebug("Generating commit proposal");
          const proposal = yield* generator.generate(snapshot);
          yield* Effect.logDebug("Generated commit proposal", {
            commitMessageBytes: proposal.message.length,
          });

          yield* Effect.logDebug("Requesting commit review");
          const decision = yield* review.review(proposal);
          yield* Effect.logDebug("Commit review completed", { decision: decision._tag });

          if (decision._tag === "Reject") {
            return { _tag: "Rejected" };
          }

          yield* Effect.logDebug("Committing approved proposal");
          yield* repository.commitApproved(snapshot, proposal.message);

          return {
            _tag: "Committed",
            commitMessage: proposal.message,
          };
        },
        Effect.annotateLogs({ service: "CommitWorkflow" }),
        Effect.withLogSpan("commit.workflow"),
      );

      return CommitWorkflow.of({ run });
    }),
  );
}

export { CommitWorkflow };
