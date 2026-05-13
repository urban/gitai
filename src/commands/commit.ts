import { Console, Effect, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { type CommitOutcomeType } from "../domain/Commit";
import { formatCommitOperationalError } from "../errors/CommitError";
import { CommitWorkflow } from "../services/CommitWorkflow";

class CommitCommandError extends Schema.TaggedErrorClass<CommitCommandError>()(
  "CommitCommandError",
  {
    message: Schema.NonEmptyString,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

const commitConfig = {
  contextLinesOption: Flag.integer("contextLineOption").pipe(
    Flag.withDefault(3),
    Flag.withDescription("Number of context lines to show"),
  ),
};

type CommitConfig = Command.Command.Config.Infer<typeof commitConfig>;

const renderOutcome = Effect.fn("commit.renderOutcome")(function* (outcome: CommitOutcomeType) {
  if (outcome._tag === "Committed") {
    yield* Console.log("Successfully committed changes!");
  }
});

const handler = Effect.fn("commit.handler")(
  function* ({ contextLinesOption }: CommitConfig) {
    yield* Effect.logDebug("Starting gitai commit", { contextLines: contextLinesOption });

    const workflow = yield* CommitWorkflow;
    const outcome = yield* workflow.run({ contextLines: contextLinesOption }).pipe(
      Effect.tapError((error) => Effect.logDebug("Commit workflow failed", { error })),
      Effect.mapError(
        (error) =>
          new CommitCommandError({
            message: formatCommitOperationalError(error),
            cause: error,
          }),
      ),
    );

    yield* Effect.logDebug("Commit workflow completed", { outcome: outcome._tag });
    yield* renderOutcome(outcome);
  },
  Effect.annotateLogs({ command: "commit" }),
  Effect.withLogSpan("gitai.commit"),
);

const commandCommit = Command.make("commit", commitConfig).pipe(
  Command.withDescription("Generate commit message"),
  Command.withHandler(handler),
);

export { commandCommit };
