import assert from "node:assert/strict";
import test from "node:test";

import { Effect, Layer } from "effect";
import { AiError, LanguageModel } from "effect/unstable/ai";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { renderCommitOperationalError } from "../commands/commit/render.ts";
import { CommitMessageGenerator } from "./CommitMessageGenerator.ts";

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
};

const runGenerateWithLayer = ({ instruction, layer }) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const generator = yield* CommitMessageGenerator;

      return yield* generator.generate(stagedSnapshot, instruction);
    }).pipe(Effect.provide(layer)),
  );

const runGenerate = ({ instruction, generateObject }) =>
  runGenerateWithLayer({
    instruction,
    layer: CommitMessageGenerator.layer.pipe(
      Layer.provide(
        Layer.succeed(LanguageModel.LanguageModel, {
          generateObject,
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

const makeTextOutput = (text) => ({
  type: "message",
  id: "msg_123",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
});

const makeOpenAiResponse = (overrides = {}) => ({
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

const decodeRequestBody = (requestInit) => {
  const body = requestInit?.body;

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  if (body instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(body));
  }

  throw new Error("Expected a JSON request body");
};

test("generate builds one structured proposal request from the staged patch and optional instruction", async () => {
  const requests = [];

  const proposal = await runGenerate({
    instruction: "focus on test coverage",
    generateObject: (options) => {
      requests.push(options);

      return Effect.succeed({
        value: {
          summary: "test: improve generator coverage",
          body: "Assert the staged diff and instruction both shape the request.",
        },
      });
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].objectName, "commit_proposal");
  assert.match(requests[0].prompt, /focus on test coverage/u);
  assert.match(requests[0].prompt, /diff --git a\/src\/index\.ts/u);
  assert.deepEqual(proposal, {
    summary: "test: improve generator coverage",
    body: "Assert the staged diff and instruction both shape the request.",
  });
});

test("generate returns exactly one decoded proposal object when no instruction is provided", async () => {
  const requests = [];

  const proposal = await runGenerate({
    instruction: undefined,
    generateObject: (options) => {
      requests.push(options);

      return Effect.succeed({
        value: {
          summary: "feat: log hello from the CLI entrypoint",
        },
      });
    },
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0].prompt, /Staged diff:/u);
  assert.doesNotMatch(requests[0].prompt, /Additional instruction:/u);
  assert.deepEqual(proposal, {
    summary: "feat: log hello from the CLI entrypoint",
  });
});

test("live layer sends the default Codex-medium policy through the real OpenAI provider boundary", async () => {
  const requests = [];
  const previousApiKey = process.env.OPENAI_API_KEY;

  process.env.OPENAI_API_KEY = "sk-test-key";

  try {
    const proposal = await runGenerateWithLayer({
      instruction: undefined,
      layer: Layer.mergeAll(
        CommitMessageGenerator.liveLayer,
        Layer.succeed(FetchHttpClient.Fetch, async (url, init) => {
          requests.push({
            url,
            init,
          });

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
      ),
    });

    assert.equal(requests.length, 1);

    const requestBody = decodeRequestBody(requests[0].init);

    assert.equal(requestBody.model, "codex-medium");
    assert.equal(requestBody.reasoning?.effort, "medium");
    assert.equal(requestBody.text?.format?.type, "json_schema");
    assert.match(requestBody.input[0].content[0].text, /diff --git/u);
    assert.deepEqual(proposal, {
      summary: "feat: add live provider wiring",
    });
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
  }
});

test("generate maps model and provider failures into stderr-facing command errors", async () => {
  const cases = [
    {
      error: AiError.make({
        module: "OpenAiLanguageModel",
        method: "generateObject",
        reason: new AiError.InvalidRequestError({
          description: "unsupported model override",
        }),
      }),
      reason: "model",
      matcher: /unsupported model override/u,
    },
    {
      error: AiError.make({
        module: "OpenAiLanguageModel",
        method: "generateObject",
        reason: new AiError.AuthenticationError({
          kind: "MissingKey",
        }),
      }),
      reason: "provider",
      matcher: /No API key provided/u,
    },
  ];

  for (const testCase of cases) {
    await assert.rejects(
      () =>
        runGenerate({
          instruction: undefined,
          generateObject: () => Effect.fail(testCase.error),
        }),
      (error) => {
        assert.equal(error._tag, "CommitMessageGeneratorError");
        assert.equal(error.reason, testCase.reason);

        const rendered = renderCommitOperationalError(error);

        assert.equal(rendered.stream, "stderr");
        assert.match(rendered.text, testCase.matcher);
        return true;
      },
    );
  }
});
