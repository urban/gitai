import * as Console from "effect/Console";
import * as FileSystem from "effect/FileSystem";
import { Context, Effect, Layer } from "effect";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import * as Prompt from "effect/unstable/cli/Prompt";

import { writeCliRender } from "../CliLogger.ts";
import { type CommitProposal, type ReviewDecision } from "../domain/Commit.ts";
import { renderCommitProposal } from "../commands/commit/render.ts";

const toReviewDecision = (approved: boolean): ReviewDecision =>
  approved ? { _tag: "Approve" } : { _tag: "Reject" };

export class CommitReview extends Context.Service<
  CommitReview,
  {
    review(proposal: CommitProposal): Effect.Effect<ReviewDecision>;
  }
>()("@urban/gitai/services/CommitReview") {
  static readonly layer = Layer.effect(
    CommitReview,
    Effect.gen(function* () {
      const console = yield* Console.Console;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const terminal = yield* Terminal.Terminal;

      return CommitReview.of({
        review: Effect.fn("CommitReview.review")(function* (proposal: CommitProposal) {
          yield* writeCliRender(renderCommitProposal(proposal)).pipe(
            Effect.provideService(Console.Console, console),
          );

          const approved = yield* Prompt.confirm({
            message: "Approve this commit message?",
            label: {
              confirm: "approve",
              deny: "reject",
            },
          })
            .asEffect()
            .pipe(
              Effect.provideService(FileSystem.FileSystem, fileSystem),
              Effect.provideService(Path.Path, path),
              Effect.provideService(Terminal.Terminal, terminal),
              Effect.catchTag("QuitError", () => Effect.succeed(false)),
            );

          return toReviewDecision(approved);
        }),
      });
    }),
  );
}
