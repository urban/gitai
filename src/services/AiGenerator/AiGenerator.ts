import { Effect, Layer, PlatformError, Schema, Context } from "effect";
import { Templater, TemplaterError } from "../Templater";
import { CliAgent, CliAgentError } from "../CliAgent";
import { CommitResponse } from "./schemas";

class AiGeneratorError extends Schema.TaggedErrorClass<AiGeneratorError>()("AiGeneratorError", {
  message: Schema.NonEmptyString,
  cause: Schema.optional(Schema.Unknown),
}) {}

class AiGenerator extends Context.Service<
  AiGenerator,
  {
    generateCommitMessage: (
      diff: string,
    ) => Effect.Effect<
      CommitResponse,
      | TemplaterError
      | CliAgentError
      | PlatformError.PlatformError
      | PlatformError.BadArgument
      | AiGeneratorError,
      never
    >;
  }
>()("@gitai/AiGenerator") {
  static readonly layer = Layer.effect(
    AiGenerator,
    Effect.gen(function* () {
      const templater = yield* Templater;
      const agent = yield* CliAgent;

      // TODO: Create a service for lazy loading prompt
      const getCommitTemplate = yield* templater
        .load(new URL("./make-commit-prompt.md", import.meta.url))
        .pipe(Effect.cached);

      const generateCommitMessage = Effect.fn("AiGenerator.generateCommitMessage")(function* (
        diff: string,
      ) {
        yield* Effect.log("Generating commit message...");
        const prompt = yield* getCommitTemplate.pipe(
          Effect.flatMap((template) => templater.compile(template, { diff })),
        );

        const response = yield* agent.command({ prompt, outputSchema: CommitResponse });
        const result = yield* Schema.decodeEffect(Schema.fromJsonString(CommitResponse))(
          response,
        ).pipe(
          Effect.mapError(
            (cause) =>
              new AiGeneratorError({
                message: "Invalid JSON response from codex",
                cause,
              }),
          ),
        );

        return result;
      });

      return AiGenerator.of({
        generateCommitMessage,
      });
    }),
  );
}

export { AiGenerator };
