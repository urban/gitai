import { Context, Effect, Layer } from "effect";

import {
  type CommitInvocationInput,
  type CommitOutcome,
  renderCommitMessage,
} from "../domain/Commit";
import type { CommitOperationalError } from "../errors/CommitError";
import { CommitMessageGenerator } from "./CommitMessageGenerator";
import { CommitReview } from "./CommitReview";
import { GitRepository } from "./GitRepository";

export class CommitWorkflow extends Context.Service<
  CommitWorkflow,
  {
    run(
      cwd: string,
      input: CommitInvocationInput,
    ): Effect.Effect<CommitOutcome, CommitOperationalError>;
  }
>()("@urban/gitai/services/CommitWorkflow") {
  static readonly layer = Layer.effect(
    CommitWorkflow,
    Effect.gen(function* () {
      const repository = yield* GitRepository;
      const generator = yield* CommitMessageGenerator;
      const review = yield* CommitReview;

      const run = Effect.fn("CommitWorkflow.run")(function* (
        cwd: string,
        input: CommitInvocationInput,
      ) {
        const snapshot = yield* repository.loadSnapshot(cwd);
        const proposal = yield* generator.generate(snapshot, input.instruction);
        const decision = yield* review.review(proposal);

        if (decision._tag === "Reject") {
          return {
            _tag: "Rejected",
          } satisfies CommitOutcome;
        }

        const commitMessage = renderCommitMessage(proposal);

        yield* repository.commitApproved(snapshot, commitMessage);

        return {
          _tag: "Committed",
          commitMessage,
        } satisfies CommitOutcome;
      });

      return CommitWorkflow.of({
        run,
      });
    }),
  );

  static readonly liveLayer = CommitWorkflow.layer.pipe(
    Layer.provide(
      Layer.mergeAll(GitRepository.layer, CommitMessageGenerator.liveLayer, CommitReview.layer),
    ),
  );
}
