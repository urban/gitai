import { Effect, Schema } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import { GitClient } from "../services/GitClient";
import { AiGenerator } from "../services/AiGenerator";

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
} as const;

type CommitConfig = Command.Command.Config.Infer<typeof commitConfig>;

const handler = Effect.fnUntraced(function* ({ contextLinesOption }: CommitConfig) {
  const gitClient = yield* GitClient;
  const aiGenerator = yield* AiGenerator;

  const rawDiff = yield* gitClient.getStagedDiff(contextLinesOption);
  const diff = yield* gitClient.filterDiff(rawDiff);

  const response = yield* aiGenerator
    .generateCommitMessage(diff)
    .pipe(Effect.mapError((error) => new CommitCommandError({ message: error.message })));

  yield* Effect.log("Generated Commit Message");
  yield* Effect.log();
  yield* Effect.log(response.message);
  yield* Effect.log();

  const confirm = yield* Prompt.confirm({
    initial: true,
    message: "Would you like to commit with this message?",
  });

  if (confirm) {
    yield* gitClient.commit(response.message);
    yield* Effect.log("Successfully committed changes!");
  }
});

const commandCommit = Command.make("commit", commitConfig).pipe(
  Command.withDescription("Generate commit message"),
  Command.withHandler(handler),
);

export { commandCommit };
