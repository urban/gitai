import { Context, Effect, Layer, PlatformError } from "effect";
import { type CommitProposalType, type StagedSnapshotType } from "../../domain/Commit";
import {
  CommitMessageGeneratorError,
  type CommitMessageGeneratorErrorReasonType,
} from "../../errors/CommitError";
import { CliAgent, type CliAgentError } from "../CliAgent";
import {
  CommitMessageResponse,
  type CommitMessageValidationError,
  decodeValidatedCommitMessage,
} from "./CommitMessageRules";
import { Templater, type TemplaterError } from "../Templater";

const toGeneratorError = (
  reason: CommitMessageGeneratorErrorReasonType,
  error: { readonly message: string },
): CommitMessageGeneratorError =>
  new CommitMessageGeneratorError({
    reason,
    message: error.message,
    cause: error,
  });

const toPromptError = (
  error: TemplaterError | PlatformError.PlatformError | PlatformError.BadArgument,
): CommitMessageGeneratorError => toGeneratorError("prompt", error);

const toProviderError = (
  error: CliAgentError | PlatformError.PlatformError,
): CommitMessageGeneratorError => toGeneratorError("provider", error);

const toResponseError = (error: CommitMessageValidationError): CommitMessageGeneratorError =>
  toGeneratorError(
    error.message.startsWith("Codex returned invalid") ? "response-decode" : "validation",
    error,
  );

class CommitMessageGenerator extends Context.Service<
  CommitMessageGenerator,
  {
    readonly generate: (
      snapshot: StagedSnapshotType,
    ) => Effect.Effect<CommitProposalType, CommitMessageGeneratorError>;
  }
>()("@urban/gitai/services/CommitMessageGenerator/CommitMessageGenerator") {
  static readonly layer = Layer.effect(
    CommitMessageGenerator,
    Effect.gen(function* () {
      const templater = yield* Templater;
      const agent = yield* CliAgent;

      const getCommitTemplate = yield* templater
        .load(new URL("./make-commit-prompt.md", import.meta.url))
        .pipe(Effect.cached);

      const generate = Effect.fn("CommitMessageGenerator.generate")(function* (
        snapshot: StagedSnapshotType,
      ): Effect.fn.Return<CommitProposalType, CommitMessageGeneratorError> {
        yield* Effect.log("Generating commit message...");

        const template = yield* getCommitTemplate.pipe(Effect.mapError(toPromptError));
        const prompt = yield* templater
          .compile(template, { diff: snapshot.stagedPatch })
          .pipe(Effect.mapError(toPromptError));
        const response = yield* agent
          .command({ prompt, outputSchema: CommitMessageResponse })
          .pipe(Effect.mapError(toProviderError));
        const message = yield* decodeValidatedCommitMessage(response).pipe(
          Effect.mapError(toResponseError),
        );

        return { message };
      });

      return CommitMessageGenerator.of({
        generate,
      });
    }),
  );
}

export { CommitMessageGenerator };
