import assert from "node:assert/strict";
import test from "node:test";

import { Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";

import { CommitMessageGenerator } from "../src/commit/services.ts";

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

const runGenerate = ({ instruction, generateObject }) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const generator = yield* CommitMessageGenerator;

      return yield* generator.generate(stagedSnapshot, instruction);
    }).pipe(
      Effect.provide(
        CommitMessageGenerator.layer.pipe(
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
      ),
    ),
  );

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
