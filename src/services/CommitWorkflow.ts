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

      const run = Effect.fn("CommitWorkflow.run")(function* (
        input: CommitInvocationInputType,
      ): Effect.fn.Return<CommitOutcomeType, CommitOperationalError> {
        const snapshot = yield* repository.loadSnapshot(".", input.contextLines);
        const proposal = yield* generator.generate(snapshot);
        const decision = yield* review.review(proposal);

        if (decision._tag === "Reject") {
          return { _tag: "Rejected" };
        }

        yield* repository.commitApproved(snapshot, proposal.message);

        return {
          _tag: "Committed",
          commitMessage: proposal.message,
        };
      });

      return CommitWorkflow.of({ run });
    }),
  );
}

export { CommitWorkflow };
