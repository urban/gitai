import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import * as Console from "effect/Console";
import { Effect, Layer } from "effect";
import * as TestConsole from "effect/testing/TestConsole";

import { runCommitCommand } from "../src/cli.ts";
import { renderCommitProposal } from "../src/commit/terminal.ts";
import { CommitMessageGeneratorError } from "../src/commit/errors.ts";
import { CommitReview, CommitWorkflow } from "../src/commit/workflow.ts";
import { CommitMessageGenerator, GitRepository } from "../src/commit/services.ts";

const createTempDirectory = () =>
  realpathSync(mkdtempSync(join(tmpdir(), "gitai-commit-command-")));

const runGit = (cwd, ...args) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "git command failed");
  }

  return result.stdout;
};

const createRepository = (t) => {
  const repoRoot = createTempDirectory();

  t.after(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  runGit(repoRoot, "init");
  runGit(repoRoot, "config", "user.name", "Gitai Test");
  runGit(repoRoot, "config", "user.email", "gitai@example.com");

  return repoRoot;
};

const createPathExecutable = (t) => {
  const binDirectory = createTempDirectory();
  const executablePath = resolve(binDirectory, "gitai");
  const entrypointPath = resolve(process.cwd(), "src", "index.ts");

  t.after(() => {
    rmSync(binDirectory, { recursive: true, force: true });
  });

  writeFileSync(
    executablePath,
    `#!/bin/sh
exec bun "${entrypointPath}" "$@"
`,
    {
      encoding: "utf8",
      mode: 0o755,
    },
  );

  return { binDirectory, executablePath };
};

const createGeneratorLayer = (generate) =>
  Layer.succeed(
    CommitMessageGenerator,
    CommitMessageGenerator.of({
      generate,
    }),
  );

const createReviewLayer = (review) =>
  Layer.succeed(
    CommitReview,
    CommitReview.of({
      review,
    }),
  );

const createRenderedReviewLayer = (decide) =>
  createReviewLayer((proposal) =>
    Effect.gen(function* () {
      yield* Console.log(renderCommitProposal(proposal).text);
      return yield* decide(proposal);
    }),
  );

const runCommand = ({ cwd, input, generatorLayer, reviewLayer }) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* runCommitCommand(cwd, input);

      return {
        logs: yield* TestConsole.logLines,
        errors: yield* TestConsole.errorLines,
      };
    }).pipe(
      Effect.provide(TestConsole.layer),
      Effect.provide(CommitWorkflow.layer),
      Effect.provide(generatorLayer),
      Effect.provide(reviewLayer),
      Effect.provide(GitRepository.layer),
    ),
  );

test("runCommitCommand creates a commit after approval and renders the reviewed proposal", async (t) => {
  const repoRoot = createRepository(t);

  writeFileSync(resolve(repoRoot, "README.md"), "# gitai\n");
  runGit(repoRoot, "add", "README.md");

  const result = await runCommand({
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
    reviewLayer: createRenderedReviewLayer(() => Effect.succeed({ _tag: "Approve" })),
  });

  assert.equal(runGit(repoRoot, "rev-list", "--count", "--all").trim(), "1");
  assert.equal(
    runGit(repoRoot, "log", "-1", "--pretty=%B").replace(/\n$/u, ""),
    "docs: add README\n\nDescribe the initial command surface.",
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.logs, [
    "Proposed commit message:\n\ndocs: add README\n\nDescribe the initial command surface.",
    "Committed with message:\n\ndocs: add README\n\nDescribe the initial command surface.",
  ]);
});

test("runCommitCommand rejects without creating a commit", async (t) => {
  const repoRoot = createRepository(t);

  writeFileSync(resolve(repoRoot, "README.md"), "# gitai\n");
  runGit(repoRoot, "add", "README.md");

  const result = await runCommand({
    cwd: repoRoot,
    input: {},
    generatorLayer: createGeneratorLayer(() =>
      Effect.succeed({
        summary: "docs: add README",
      }),
    ),
    reviewLayer: createRenderedReviewLayer(() => Effect.succeed({ _tag: "Reject" })),
  });

  assert.equal(runGit(repoRoot, "rev-list", "--count", "--all").trim(), "0");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.logs, [
    "Proposed commit message:\n\ndocs: add README",
    "Commit aborted without creating a commit.",
  ]);
});

test("runCommitCommand renders stderr for invalid repo, unstaged snapshot, and provider failures without creating commits", async (t) => {
  const notARepoDirectory = createTempDirectory();

  t.after(() => {
    rmSync(notARepoDirectory, { recursive: true, force: true });
  });

  const emptyRepoRoot = createRepository(t);
  const providerRepoRoot = createRepository(t);

  writeFileSync(resolve(providerRepoRoot, "README.md"), "# gitai\n");
  runGit(providerRepoRoot, "add", "README.md");

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
  ];

  for (const testCase of cases) {
    const result = await runCommand({
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
      reviewLayer: createRenderedReviewLayer(() => Effect.succeed({ _tag: "Approve" })),
    });

    assert.deepEqual(result.logs, []);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].includes(testCase.expectedError), true);
  }

  assert.equal(runGit(emptyRepoRoot, "rev-list", "--count", "--all").trim(), "0");
  assert.equal(runGit(providerRepoRoot, "rev-list", "--count", "--all").trim(), "0");
});

test("runCommitCommand renders stderr and creates no commit when the staged fingerprint drifts during review", async (t) => {
  const repoRoot = createRepository(t);
  const readmePath = resolve(repoRoot, "README.md");

  writeFileSync(readmePath, "# gitai\n");
  runGit(repoRoot, "add", "README.md");

  const result = await runCommand({
    cwd: repoRoot,
    input: {},
    generatorLayer: createGeneratorLayer(() =>
      Effect.succeed({
        summary: "docs: add README",
      }),
    ),
    reviewLayer: createRenderedReviewLayer(() =>
      Effect.sync(() => {
        writeFileSync(readmePath, "# gitai\n\nupdated during review\n");
        runGit(repoRoot, "add", "README.md");

        return { _tag: "Approve" };
      }),
    ),
  });

  assert.equal(runGit(repoRoot, "rev-list", "--count", "--all").trim(), "0");
  assert.deepEqual(result.logs, ["Proposed commit message:\n\ndocs: add README"]);
  assert.deepEqual(result.errors, [`ERROR\n  Staged changes changed during review in ${repoRoot}`]);
});

test("the PATH-style gitai executable fails from a nested repository directory after resolving the repo root", (t) => {
  const repoRoot = createRepository(t);
  const nestedWorkingDirectory = resolve(repoRoot, "packages", "feature");
  const { binDirectory } = createPathExecutable(t);

  mkdirSync(nestedWorkingDirectory, { recursive: true });

  const result = spawnSync("gitai", ["commit"], {
    cwd: nestedWorkingDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "test-openai-api-key",
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
    },
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.stdout, "");
  assert.equal(result.stderr, `ERROR\n  No staged changes were found in ${repoRoot}\n`);
});
