import { Context, Effect, FileSystem, Layer, Path } from "effect";
import * as Terminal from "effect/Terminal";
import * as Prompt from "effect/unstable/cli/Prompt";
import {
  type CommitInvocationInputType,
  type CommitOutcomeType,
  type ReviewDecisionType,
} from "../domain/Commit";
import { type CommitOperationalError } from "../errors/CommitError";
import { CliPresenter } from "./CliPresenter";
import { CommitMessageGenerator } from "./CommitMessageGenerator";
import { GitRepository } from "./GitRepository";

const toReviewDecision = (approved: boolean): ReviewDecisionType =>
  approved ? { _tag: "Approve" } : { _tag: "Reject" };

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
      const presenter = yield* CliPresenter;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const terminal = yield* Terminal.Terminal;

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
          const proposal = yield* presenter.applyIndicator(
            generator.generate(snapshot),
            "Generating commit message...",
          );
          yield* Effect.logDebug("Generated commit proposal", {
            commitMessageBytes: proposal.message.length,
          });

          yield* presenter.log("Generated Commit Message");
          yield* presenter.log();
          yield* presenter.log(proposal.message);
          yield* presenter.log();

          yield* Effect.logDebug("Requesting commit review");
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
