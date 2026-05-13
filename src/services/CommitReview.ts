import { Console, Context, Effect, FileSystem, Layer, Path } from "effect";
import * as Terminal from "effect/Terminal";
import * as Prompt from "effect/unstable/cli/Prompt";
import { type CommitProposalType, type ReviewDecisionType } from "../domain/Commit";

const toReviewDecision = (approved: boolean): ReviewDecisionType =>
  approved ? { _tag: "Approve" } : { _tag: "Reject" };

class CommitReview extends Context.Service<
  CommitReview,
  {
    readonly review: (proposal: CommitProposalType) => Effect.Effect<ReviewDecisionType>;
  }
>()("@urban/gitai/services/CommitReview") {
  static readonly layer = Layer.effect(
    CommitReview,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const terminal = yield* Terminal.Terminal;

      const review = Effect.fn("CommitReview.review")(
        function* (proposal: CommitProposalType) {
          yield* Console.log("Generated Commit Message");
          yield* Console.log();
          yield* Console.log(proposal.message);
          yield* Console.log();

          const approved = yield* Prompt.confirm({
            initial: true,
            message: "Would you like to commit with this message?",
          })
            .asEffect()
            .pipe(
              Effect.provideService(FileSystem.FileSystem, fileSystem),
              Effect.provideService(Path.Path, path),
              Effect.provideService(Terminal.Terminal, terminal),
              Effect.catchTag("QuitError", () => Effect.succeed(false)),
            );
          const decision = toReviewDecision(approved);
          yield* Effect.logDebug("Commit review decision received", { decision: decision._tag });

          return decision;
        },
        Effect.annotateLogs({ service: "CommitReview" }),
        Effect.withLogSpan("commit.review"),
      );

      return CommitReview.of({ review });
    }),
  );
}

export { CommitReview };
