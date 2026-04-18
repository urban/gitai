import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import * as Console from "effect/Console";
import { Effect, Layer } from "effect";
import * as TestConsole from "effect/testing/TestConsole";
import { resolve } from "node:path";

import { type CommitInvocationInput, type ReviewDecision } from "../domain/Commit";
import { CommitMessageGeneratorError } from "../errors/CommitError";
import { CommitMessageGenerator } from "../services/CommitMessageGenerator";
import { CommitReview } from "../services/CommitReview";
import { CommitWorkflow } from "../services/CommitWorkflow";
import { GitRepository } from "../services/GitRepository";
import {
  createRepository,
  createTempDirectory,
  runGit,
  writeTextFile,
} from "../test-support/GitTestSupport";
import { runCommitCommand, validateCommitCommandGrammar } from "./commit";
import { renderCommitProposal } from "./commit/render";

const approveDecision = { _tag: "Approve" } satisfies ReviewDecision;
const rejectDecision = { _tag: "Reject" } satisfies ReviewDecision;

const createGeneratorLayer = (generate: CommitMessageGenerator["Service"]["generate"]) =>
  Layer.succeed(
    CommitMessageGenerator,
    CommitMessageGenerator.of({
      generate,
    }),
  );

const createReviewLayer = (review: CommitReview["Service"]["review"]) =>
  Layer.succeed(
    CommitReview,
    CommitReview.of({
      review,
    }),
  );

const createRenderedReviewLayer = (decide: CommitReview["Service"]["review"]) =>
  createReviewLayer((proposal) =>
    Effect.gen(function* () {
      yield* Console.log(renderCommitProposal(proposal).text);
      return yield* decide(proposal);
    }),
  );

const runCommand = (options: {
  readonly cwd: string;
  readonly input: CommitInvocationInput;
  readonly generatorLayer: ReturnType<typeof createGeneratorLayer>;
  readonly reviewLayer: ReturnType<typeof createReviewLayer>;
}) =>
  Effect.gen(function* () {
    yield* runCommitCommand(options.cwd, options.input);

    return {
      errors: yield* TestConsole.errorLines,
      logs: yield* TestConsole.logLines,
    };
  }).pipe(
    Effect.provide(TestConsole.layer),
    Effect.provide(CommitWorkflow.layer),
    Effect.provide(options.generatorLayer),
    Effect.provide(options.reviewLayer),
    Effect.provide(GitRepository.layer),
    Effect.provide(NodeServices.layer),
  );

describe("commit command", () => {
  it("parses gitai commit without an instruction", () => {
    assert.strictEqual(validateCommitCommandGrammar(["commit"]), undefined);
  });

  it("parses gitai commit with one instruction string", () => {
    assert.strictEqual(
      validateCommitCommandGrammar(["commit", "focus on test coverage"]),
      undefined,
    );
  });

  it("rejects extra positional arguments for gitai commit", () => {
    assert.strictEqual(
      validateCommitCommandGrammar(["commit", "focus on test coverage", "extra-input"]),
      "gitai commit accepts zero or one optional instruction string",
    );
  });

  it.effect(
    "runCommitCommand creates a commit after approval and renders the reviewed proposal",
    () =>
      Effect.gen(function* () {
        const repoRoot = yield* createRepository("gitai-commit-command-");

        yield* writeTextFile(resolve(repoRoot, "README.md"), "# gitai\n");
        yield* runGit(repoRoot, "add", "README.md");

        const result = yield* runCommand({
          cwd: repoRoot,
          input: {
            instruction: "focus on release readiness",
          },
          generatorLayer: createGeneratorLayer(() =>
            Effect.succeed({
              summary: "docs: add README",
              body: "Describe the initial command surface.",
            }),
          ),
          reviewLayer: createRenderedReviewLayer(() => Effect.succeed(approveDecision)),
        });

        assert.strictEqual((yield* runGit(repoRoot, "rev-list", "--count", "--all")).trim(), "1");
        assert.strictEqual(
          (yield* runGit(repoRoot, "log", "-1", "--pretty=%B")).replace(/\n$/u, ""),
          "docs: add README\n\nDescribe the initial command surface.",
        );
        assert.deepStrictEqual(result.errors, []);
        assert.deepStrictEqual(result.logs, [
          "Proposed commit message:\n\ndocs: add README\n\nDescribe the initial command surface.",
          "Committed with message:\n\ndocs: add README\n\nDescribe the initial command surface.",
        ]);
      }),
  );

  it.effect("runCommitCommand rejects without creating a commit", () =>
    Effect.gen(function* () {
      const repoRoot = yield* createRepository("gitai-commit-command-");

      yield* writeTextFile(resolve(repoRoot, "README.md"), "# gitai\n");
      yield* runGit(repoRoot, "add", "README.md");

      const result = yield* runCommand({
        cwd: repoRoot,
        input: {},
        generatorLayer: createGeneratorLayer(() =>
          Effect.succeed({
            summary: "docs: add README",
          }),
        ),
        reviewLayer: createRenderedReviewLayer(() => Effect.succeed(rejectDecision)),
      });

      assert.strictEqual((yield* runGit(repoRoot, "rev-list", "--count", "--all")).trim(), "0");
      assert.deepStrictEqual(result.errors, []);
      assert.deepStrictEqual(result.logs, [
        "Proposed commit message:\n\ndocs: add README",
        "Commit aborted without creating a commit.",
      ]);
    }),
  );

  it.effect(
    "runCommitCommand renders stderr for invalid repo, unstaged snapshot, and provider failures without creating commits",
    () =>
      Effect.gen(function* () {
        const notARepoDirectory = yield* createTempDirectory("gitai-not-a-repo-");
        const emptyRepoRoot = yield* createRepository("gitai-commit-command-");
        const providerRepoRoot = yield* createRepository("gitai-commit-command-");

        yield* writeTextFile(resolve(providerRepoRoot, "README.md"), "# gitai\n");
        yield* runGit(providerRepoRoot, "add", "README.md");

        const cases = [
          {
            cwd: notARepoDirectory,
            input: {},
            expectedError: "Current directory is not inside a Git repository",
          },
          {
            cwd: emptyRepoRoot,
            input: {},
            expectedError: `No staged changes were found in ${emptyRepoRoot}`,
          },
          {
            cwd: providerRepoRoot,
            input: {},
            expectedError: "Commit message generation failed (provider): provider unavailable",
          },
        ] satisfies Array<{
          readonly cwd: string;
          readonly input: CommitInvocationInput;
          readonly expectedError: string;
        }>;

        for (const testCase of cases) {
          const result = yield* runCommand({
            cwd: testCase.cwd,
            input: testCase.input,
            generatorLayer: createGeneratorLayer(() =>
              Effect.fail(
                new CommitMessageGeneratorError({
                  reason: "provider",
                  message: "provider unavailable",
                }),
              ),
            ),
            reviewLayer: createRenderedReviewLayer(() => Effect.succeed(approveDecision)),
          });

          assert.deepStrictEqual(result.logs, []);
          assert.isTrue(result.errors.length >= 1);

          const renderedError = result.errors
            .filter((line): line is string => typeof line === "string")
            .join("\n");

          assert.notStrictEqual(renderedError, "");
          assert.isTrue(renderedError.includes(testCase.expectedError));
        }

        assert.strictEqual(
          (yield* runGit(emptyRepoRoot, "rev-list", "--count", "--all")).trim(),
          "0",
        );
        assert.strictEqual(
          (yield* runGit(providerRepoRoot, "rev-list", "--count", "--all")).trim(),
          "0",
        );
      }),
  );

  it.effect(
    "runCommitCommand renders stderr and creates no commit when the staged fingerprint drifts during review",
    () =>
      Effect.gen(function* () {
        const repoRoot = yield* createRepository("gitai-commit-command-");
        const readmePath = resolve(repoRoot, "README.md");

        yield* writeTextFile(readmePath, "# gitai\n");
        yield* runGit(repoRoot, "add", "README.md");

        const result = yield* runCommand({
          cwd: repoRoot,
          input: {},
          generatorLayer: createGeneratorLayer(() =>
            Effect.succeed({
              summary: "docs: add README",
            }),
          ),
          reviewLayer: createRenderedReviewLayer(() =>
            Effect.gen(function* () {
              yield* writeTextFile(readmePath, "# gitai\n\nupdated during review\n").pipe(
                Effect.orDie,
              );
              yield* runGit(repoRoot, "add", "README.md").pipe(Effect.orDie);
              return approveDecision;
            }),
          ),
        });

        assert.strictEqual((yield* runGit(repoRoot, "rev-list", "--count", "--all")).trim(), "0");
        assert.deepStrictEqual(result.logs, ["Proposed commit message:\n\ndocs: add README"]);
        assert.deepStrictEqual(result.errors, [
          `ERROR\n  Staged changes changed during review in ${repoRoot}`,
        ]);
      }),
  );
});
