import { OpenAiClient } from "@effect/ai-openai";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { type CommitProposal, type StagedSnapshot } from "../domain/Commit";
import { renderCommitOperationalError } from "../commands/commit/render";
import { CommitMessageGenerator } from "./CommitMessageGenerator";

const stagedSnapshot = {
  repoRoot: "/tmp/repo",
  stagedPatch: [
    "diff --git a/src/index.ts b/src/index.ts",
    "--- a/src/index.ts",
    "+++ b/src/index.ts",
    "@@",
    '+console.log("hello");',
  ].join("\n"),
  indexFingerprint: "fingerprint-123",
} satisfies StagedSnapshot;

const runGenerateWithLayer = (options: {
  readonly instruction: string | undefined;
  readonly layer: Layer.Layer<CommitMessageGenerator, never, never>;
}) =>
  Effect.gen(function* () {
    const generator = yield* CommitMessageGenerator;

    return yield* generator.generate(stagedSnapshot, options.instruction);
  }).pipe(Effect.provide(options.layer));

const runGenerate = (options: {
  readonly instruction: string | undefined;
  readonly handleRequest: (request: {
    readonly objectName: string | undefined;
    readonly prompt: unknown;
  }) => CommitProposal;
}) =>
  runGenerateWithLayer({
    instruction: options.instruction,
    layer: CommitMessageGenerator.layer.pipe(
      Layer.provide(
        Layer.succeed(LanguageModel.LanguageModel, {
          generateObject: (request) =>
            Effect.succeed(
              new LanguageModel.GenerateObjectResponse(
                options.handleRequest({
                  objectName: request.objectName,
                  prompt: request.prompt,
                }),
                [],
              ),
            ),
          generateText: () => {
            throw new Error("generateText should not be called");
          },
          streamText: () => {
            throw new Error("streamText should not be called");
          },
        }),
      ),
    ),
  });

const createProviderLayer = (fetchImplementation: typeof globalThis.fetch) =>
  CommitMessageGenerator.layer.pipe(
    Layer.provide(
      CommitMessageGenerator.languageModelLayer.pipe(
        Layer.provide(
          OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
            Layer.provide(FetchHttpClient.layer),
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchImplementation)),
          ),
        ),
      ),
    ),
  );

const makeTextOutput = (text: string) => ({
  type: "message",
  id: "msg_123",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
});

const makeOpenAiResponse = (overrides: Record<string, unknown> = {}) => ({
  id: "resp_test123",
  object: "response",
  created_at: 1_713_456_789,
  model: "codex-medium",
  status: "completed",
  output: [],
  metadata: null,
  temperature: null,
  top_p: null,
  tools: [],
  tool_choice: "auto",
  error: null,
  incomplete_details: null,
  instructions: null,
  parallel_tool_calls: false,
  ...overrides,
});

type OpenAiRequestBody = {
  readonly model: string;
  readonly reasoning?: {
    readonly effort?: string;
  };
  readonly text?: {
    readonly format?: {
      readonly type?: string;
    };
  };
  readonly input: Array<{
    readonly content: Array<{
      readonly text: string;
    }>;
  }>;
};

const decodeRequestBody = (requestInit: RequestInit | undefined): OpenAiRequestBody => {
  const body = requestInit?.body;

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  if (body instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(body));
  }

  throw new Error("Expected a JSON request body");
};

describe("CommitMessageGenerator", () => {
  it.effect(
    "generate builds one structured proposal request from the staged patch and optional instruction",
    () =>
      Effect.gen(function* () {
        let objectName: string | undefined;
        let prompt: string | undefined;

        const proposal = yield* runGenerate({
          instruction: "focus on test coverage",
          handleRequest: (request) => {
            objectName = request.objectName;

            if (typeof request.prompt !== "string") {
              throw new Error("Expected a string prompt");
            }

            prompt = request.prompt;

            return {
              summary: "test: improve generator coverage",
              body: "Assert the staged diff and instruction both shape the request.",
            };
          },
        });

        assert.strictEqual(objectName, "commit_proposal");
        assert.isDefined(prompt);
        if (prompt === undefined) {
          return;
        }

        assert.match(prompt, /focus on test coverage/u);
        assert.match(prompt, /diff --git a\/src\/index\.ts/u);
        assert.deepStrictEqual(proposal, {
          summary: "test: improve generator coverage",
          body: "Assert the staged diff and instruction both shape the request.",
        });
      }),
  );

  it.effect(
    "generate returns exactly one decoded proposal object when no instruction is provided",
    () =>
      Effect.gen(function* () {
        let prompt: string | undefined;

        const proposal = yield* runGenerate({
          instruction: undefined,
          handleRequest: (request) => {
            if (typeof request.prompt !== "string") {
              throw new Error("Expected a string prompt");
            }

            prompt = request.prompt;

            return {
              summary: "feat: log hello from the CLI entrypoint",
            };
          },
        });

        assert.isDefined(prompt);
        if (prompt === undefined) {
          return;
        }

        assert.match(prompt, /Staged diff:/u);
        assert.notMatch(prompt, /Additional instruction:/u);
        assert.deepStrictEqual(proposal, {
          summary: "feat: log hello from the CLI entrypoint",
        });
      }),
  );

  it.effect(
    "provider wiring sends the default Codex-medium policy through the OpenAI boundary",
    () =>
      Effect.gen(function* () {
        let requestInit: RequestInit | undefined;

        const proposal = yield* runGenerateWithLayer({
          instruction: undefined,
          layer: createProviderLayer(async (_url, init) => {
            requestInit = init;

            return new Response(
              JSON.stringify(
                makeOpenAiResponse({
                  output: [
                    makeTextOutput(JSON.stringify({ summary: "feat: add live provider wiring" })),
                  ],
                }),
              ),
              {
                headers: {
                  "content-type": "application/json",
                },
                status: 200,
              },
            );
          }),
        });

        assert.isDefined(requestInit);
        if (requestInit === undefined) {
          return;
        }

        const requestBody = decodeRequestBody(requestInit);

        assert.strictEqual(requestBody.model, "codex-medium");
        assert.strictEqual(requestBody.reasoning?.effort, "medium");
        assert.strictEqual(requestBody.text?.format?.type, "json_schema");
        assert.match(requestBody.input[0]?.content[0]?.text ?? "", /diff --git/u);
        assert.deepStrictEqual(proposal, {
          summary: "feat: add live provider wiring",
        });
      }),
  );

  it.effect("generate maps model and provider failures into stderr-facing command errors", () =>
    Effect.gen(function* () {
      const cases = [
        {
          status: 400,
          message: "unsupported model override",
          reason: "model",
          matcher: /unsupported model override/u,
        },
        {
          status: 401,
          message: "No API key provided",
          reason: "provider",
          matcher: /InvalidKey/u,
        },
      ] satisfies Array<{
        readonly status: number;
        readonly message: string;
        readonly reason: "model" | "provider";
        readonly matcher: RegExp;
      }>;

      for (const testCase of cases) {
        const error = yield* runGenerateWithLayer({
          instruction: undefined,
          layer: createProviderLayer(
            async () =>
              new Response(
                JSON.stringify({
                  error: {
                    message: testCase.message,
                  },
                }),
                {
                  headers: {
                    "content-type": "application/json",
                  },
                  status: testCase.status,
                },
              ),
          ),
        }).pipe(Effect.flip);

        assert.strictEqual(error._tag, "CommitMessageGeneratorError");
        assert.strictEqual(error.reason, testCase.reason);

        const rendered = renderCommitOperationalError(error);

        assert.strictEqual(rendered.stream, "stderr");
        assert.match(rendered.text, testCase.matcher);
      }
    }),
  );
});
