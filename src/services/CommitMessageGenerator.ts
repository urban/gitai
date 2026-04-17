import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Config as EffectConfig, Context, Effect, Layer } from "effect";
import { AiError, LanguageModel } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

import { CommitProposal, GitAiConfigReference, type StagedSnapshot } from "../domain/Commit.ts";
import type { CommitMessageGeneratorError } from "../errors/CommitError.ts";
import { CommitMessageGeneratorError as CommitMessageGeneratorErrorClass } from "../errors/CommitError.ts";

const commitProposalPromptHeader = [
  "You write Git commit proposals from staged diffs.",
  "Return exactly one commit proposal object.",
  "Keep the summary specific to the staged changes and include a body only when it adds useful detail.",
].join("\n");

const buildCommitProposalPrompt = (
  snapshot: StagedSnapshot,
  instruction: string | undefined,
): string => {
  const sections = [commitProposalPromptHeader, `Staged diff:\n${snapshot.stagedPatch}`];

  if (instruction !== undefined) {
    sections.push(`Additional instruction:\n${instruction}`);
  }

  return sections.join("\n\n");
};

const toCommitMessageGeneratorError = (error: AiError.AiError): CommitMessageGeneratorError => {
  switch (error.reason._tag) {
    case "StructuredOutputError":
    case "InvalidOutputError":
    case "UnsupportedSchemaError":
      return new CommitMessageGeneratorErrorClass({
        reason: "response-decode",
        message: error.message,
      });
    case "InvalidRequestError":
      return new CommitMessageGeneratorErrorClass({
        reason: "model",
        message: error.message,
      });
    default:
      return new CommitMessageGeneratorErrorClass({
        reason: "provider",
        message: error.message,
      });
  }
};

const openAiClientLayer = OpenAiClient.layerConfig({
  apiKey: EffectConfig.redacted("OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

const openAiLanguageModelLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* GitAiConfigReference;

    return OpenAiLanguageModel.layer({
      model: config.model,
      config: {
        reasoning: {
          effort: config.reasoningEffort,
        },
      },
    });
  }),
);

export class CommitMessageGenerator extends Context.Service<
  CommitMessageGenerator,
  {
    generate(
      snapshot: StagedSnapshot,
      instruction: string | undefined,
    ): Effect.Effect<CommitProposal, CommitMessageGeneratorError>;
  }
>()("@urban/gitai/services/CommitMessageGenerator") {
  static readonly languageModelLayer = openAiLanguageModelLayer;

  static readonly providerLayer = CommitMessageGenerator.languageModelLayer.pipe(
    Layer.provide(openAiClientLayer),
  );

  static readonly layer = Layer.effect(
    CommitMessageGenerator,
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel;
      const generate = Effect.fn("CommitMessageGenerator.generate")(function* (
        snapshot: StagedSnapshot,
        instruction: string | undefined,
      ): Effect.fn.Return<CommitProposal, CommitMessageGeneratorError> {
        const response = yield* model
          .generateObject({
            objectName: "commit_proposal",
            prompt: buildCommitProposalPrompt(snapshot, instruction),
            schema: CommitProposal,
          })
          .pipe(Effect.mapError(toCommitMessageGeneratorError));

        return response.value;
      });

      return CommitMessageGenerator.of({
        generate,
      });
    }),
  );

  static readonly liveLayer = CommitMessageGenerator.layer.pipe(
    Layer.provide(CommitMessageGenerator.providerLayer),
  );
}
