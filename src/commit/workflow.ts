import * as Console from "effect/Console";
import * as FileSystem from "effect/FileSystem";
import { Context, Effect, Layer } from "effect";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import * as Prompt from "effect/unstable/cli/Prompt";

import {
  type CommitInvocationInput,
  type CommitOutcome,
  type CommitProposal,
  renderCommitMessage,
  type ReviewDecision,
} from "./contracts.ts";
import type { CommitOperationalError } from "./errors.ts";
import { CommitMessageGenerator, GitRepository } from "./services.ts";
import { renderCommitProposal } from "./terminal.ts";

const toReviewDecision = (approved: boolean): ReviewDecision =>
  approved ? { _tag: "Approve" } : { _tag: "Reject" };

export class CommitReview extends Context.Service<
  CommitReview,
  {
    review(proposal: CommitProposal): Effect.Effect<ReviewDecision>;
  }
>()("@urban/gitai/commit/CommitReview") {
  static readonly layer = Layer.effect(
    CommitReview,
    Effect.gen(function* () {
      const console = yield* Console.Console;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const terminal = yield* Terminal.Terminal;

      return CommitReview.of({
        review: Effect.fn("CommitReview.review")(function* (proposal: CommitProposal) {
          const renderedProposal = renderCommitProposal(proposal);

          yield* Effect.sync(() => {
            console.log(renderedProposal.text);
          });

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

export class CommitWorkflow extends Context.Service<
  CommitWorkflow,
  {
    run(
      cwd: string,
      input: CommitInvocationInput,
    ): Effect.Effect<CommitOutcome, CommitOperationalError>;
  }
>()("@urban/gitai/commit/CommitWorkflow") {
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
