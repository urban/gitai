import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Config as EffectConfig, Context, Effect, Layer } from "effect";
import { AiError, LanguageModel } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

import { CommitProposal, GitAiConfigReference, type StagedSnapshot } from "../domain/Commit";
import type { CommitMessageGeneratorError } from "../errors/CommitError";
import { CommitMessageGeneratorError as CommitMessageGeneratorErrorClass } from "../errors/CommitError";

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

const toCommitMessageGeneratorError = (
  error: AiError.AiError | EffectConfig.ConfigError,
): CommitMessageGeneratorError => {
  if (error._tag === "ConfigError") {
    return new CommitMessageGeneratorErrorClass({
      reason: "provider",
      message: error.message,
    });
  }

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

const commitMessageGeneratorProviderLayer = openAiLanguageModelLayer.pipe(
  Layer.provide(openAiClientLayer),
);

const CommitMessageGeneratorProviderLayerReference = Context.Reference<
  Layer.Layer<LanguageModel.LanguageModel, EffectConfig.ConfigError>
>("@urban/gitai/services/CommitMessageGenerator/ProviderLayer", {
  defaultValue: () => commitMessageGeneratorProviderLayer,
});

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

  static readonly providerLayer = commitMessageGeneratorProviderLayer;

  static readonly providerLayerReference = CommitMessageGeneratorProviderLayerReference;

  static readonly layer = Layer.succeed(
    CommitMessageGenerator,
    CommitMessageGenerator.of({
      generate: Effect.fn("CommitMessageGenerator.generate")(function* (
        snapshot: StagedSnapshot,
        instruction: string | undefined,
      ): Effect.fn.Return<CommitProposal, CommitMessageGeneratorError> {
        const providerLayer = yield* CommitMessageGenerator.providerLayerReference;
        const response = yield* Effect.gen(function* () {
          const model = yield* LanguageModel.LanguageModel;

          return yield* model.generateObject({
            objectName: "commit_proposal",
            prompt: buildCommitProposalPrompt(snapshot, instruction),
            schema: CommitProposal,
          });
        }).pipe(Effect.provide(providerLayer), Effect.mapError(toCommitMessageGeneratorError));

        return response.value;
      }),
    }),
  );

  static readonly liveLayer = CommitMessageGenerator.layer;
}
