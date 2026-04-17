import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { BunServices } from "@effect/platform-bun";
import { Effect } from "effect";

import { GitRepository } from "./GitRepository.ts";

const createTempDirectory = () =>
  realpathSync(mkdtempSync(join(tmpdir(), "gitai-git-repository-")));

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

const loadSnapshot = (cwd) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* GitRepository;

      return yield* repository.loadSnapshot(cwd);
    }).pipe(Effect.provide(GitRepository.layer), Effect.provide(BunServices.layer)),
  );

const commitApproved = (snapshot, commitMessage) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* GitRepository;

      return yield* repository.commitApproved(snapshot, commitMessage);
    }).pipe(Effect.provide(GitRepository.layer), Effect.provide(BunServices.layer)),
  );

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

test("loadSnapshot resolves the repo from a nested working directory and returns the staged patch plus fingerprint", async (t) => {
  const repoRoot = createRepository(t);
  const nestedWorkingDirectory = resolve(repoRoot, "packages", "feature");

  mkdirSync(nestedWorkingDirectory, { recursive: true });
  writeFileSync(resolve(repoRoot, "README.md"), "# gitai\n");
  runGit(repoRoot, "add", "README.md");

  const snapshot = await loadSnapshot(nestedWorkingDirectory);

  assert.equal(snapshot.repoRoot, repoRoot);
  assert.equal(
    snapshot.stagedPatch,
    runGit(repoRoot, "diff", "--cached", "--no-ext-diff", "--binary"),
  );
  assert.equal(snapshot.indexFingerprint, runGit(repoRoot, "write-tree").trim());
  assert.match(snapshot.stagedPatch, /README\.md/u);
  assert.equal(runGit(repoRoot, "rev-list", "--count", "--all").trim(), "0");
});

test("loadSnapshot fails with NotGitRepositoryError outside a repository", async (t) => {
  const workingDirectory = createTempDirectory();

  t.after(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  await assert.rejects(
    () => loadSnapshot(workingDirectory),
    (error) => {
      assert.equal(error._tag, "NotGitRepositoryError");
      assert.equal(error.cwd, workingDirectory);
      return true;
    },
  );
});

test("loadSnapshot fails with NoStagedChangesError when no staged diff exists", async (t) => {
  const repoRoot = createRepository(t);

  await assert.rejects(
    () => loadSnapshot(repoRoot),
    (error) => {
      assert.equal(error._tag, "NoStagedChangesError");
      assert.equal(error.repoRoot, repoRoot);
      return true;
    },
  );

  assert.equal(runGit(repoRoot, "rev-list", "--count", "--all").trim(), "0");
});

test("commitApproved creates one commit whose stored message matches the reviewed multiline message", async (t) => {
  const repoRoot = createRepository(t);

  writeFileSync(resolve(repoRoot, "README.md"), "# gitai\n");
  runGit(repoRoot, "add", "README.md");

  const snapshot = await loadSnapshot(repoRoot);
  const commitMessage = [
    "feat: add README",
    "",
    "Document the initial repository scaffold.",
    "Keep the staged snapshot review text verbatim.",
  ].join("\n");

  await commitApproved(snapshot, commitMessage);

  assert.equal(runGit(repoRoot, "rev-list", "--count", "--all").trim(), "1");
  assert.equal(runGit(repoRoot, "log", "-1", "--pretty=%B").replace(/\n$/u, ""), commitMessage);
});

test("commitApproved aborts before commit creation when the staged fingerprint changes during review", async (t) => {
  const repoRoot = createRepository(t);

  writeFileSync(resolve(repoRoot, "README.md"), "# gitai\n");
  runGit(repoRoot, "add", "README.md");

  const snapshot = await loadSnapshot(repoRoot);

  writeFileSync(resolve(repoRoot, "README.md"), "# gitai\n\nupdated during review\n");
  runGit(repoRoot, "add", "README.md");

  await assert.rejects(
    () => commitApproved(snapshot, "feat: add README"),
    (error) => {
      assert.equal(error._tag, "IndexChangedDuringReviewError");
      assert.equal(error.repoRoot, repoRoot);
      return true;
    },
  );

  assert.equal(runGit(repoRoot, "rev-list", "--count", "--all").trim(), "0");
});
