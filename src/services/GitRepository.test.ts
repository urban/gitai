import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { type StagedSnapshot } from "../domain/Commit";
import {
  createRepository,
  createTempDirectory,
  runGit,
  writeTextFile,
} from "../test-support/GitTestSupport";
import { GitRepository } from "./GitRepository";

const GitRepositoryTestLayer = GitRepository.layer.pipe(Layer.provide(NodeServices.layer));

const loadSnapshot = Effect.fn("GitRepositoryTest.loadSnapshot")(function* (cwd: string) {
  const repository = yield* GitRepository;

  return yield* repository.loadSnapshot(cwd);
});

const commitApproved = Effect.fn("GitRepositoryTest.commitApproved")(function* (
  snapshot: StagedSnapshot,
  commitMessage: string,
) {
  const repository = yield* GitRepository;

  return yield* repository.commitApproved(snapshot, commitMessage);
});

layer(GitRepositoryTestLayer)("GitRepository", (it) => {
  it.effect(
    "loadSnapshot resolves the repo from a nested working directory and returns the staged patch plus fingerprint",
    () =>
      Effect.gen(function* () {
        const repoRoot = yield* createRepository("gitai-git-repository-");
        const nestedWorkingDirectory = resolve(repoRoot, "packages", "feature");

        yield* Effect.sync(() => {
          mkdirSync(nestedWorkingDirectory, { recursive: true });
        });
        yield* writeTextFile(resolve(repoRoot, "README.md"), "# gitai\n");
        yield* runGit(repoRoot, "add", "README.md");

        const snapshot = yield* loadSnapshot(nestedWorkingDirectory);

        assert.strictEqual(snapshot.repoRoot, repoRoot);
        assert.strictEqual(
          snapshot.stagedPatch,
          yield* runGit(repoRoot, "diff", "--cached", "--no-ext-diff", "--binary"),
        );
        assert.strictEqual(
          snapshot.indexFingerprint,
          (yield* runGit(repoRoot, "write-tree")).trim(),
        );
        assert.match(snapshot.stagedPatch, /README\.md/u);
        assert.strictEqual((yield* runGit(repoRoot, "rev-list", "--count", "--all")).trim(), "0");
      }),
  );

  it.effect("loadSnapshot fails with NotGitRepositoryError outside a repository", () =>
    Effect.gen(function* () {
      const workingDirectory = yield* createTempDirectory("gitai-not-a-repo-");
      const error = yield* loadSnapshot(workingDirectory).pipe(Effect.flip);

      assert.strictEqual(error._tag, "NotGitRepositoryError");
      if (error._tag !== "NotGitRepositoryError") {
        return;
      }

      assert.strictEqual(error.cwd, workingDirectory);
    }),
  );

  it.effect("loadSnapshot fails with NoStagedChangesError when no staged diff exists", () =>
    Effect.gen(function* () {
      const repoRoot = yield* createRepository("gitai-git-repository-");
      const error = yield* loadSnapshot(repoRoot).pipe(Effect.flip);

      assert.strictEqual(error._tag, "NoStagedChangesError");
      if (error._tag !== "NoStagedChangesError") {
        return;
      }

      assert.strictEqual(error.repoRoot, repoRoot);
      assert.strictEqual((yield* runGit(repoRoot, "rev-list", "--count", "--all")).trim(), "0");
    }),
  );

  it.effect(
    "commitApproved creates one commit whose stored message matches the reviewed multiline message",
    () =>
      Effect.gen(function* () {
        const repoRoot = yield* createRepository("gitai-git-repository-");

        yield* writeTextFile(resolve(repoRoot, "README.md"), "# gitai\n");
        yield* runGit(repoRoot, "add", "README.md");

        const snapshot = yield* loadSnapshot(repoRoot);
        const commitMessage = [
          "feat: add README",
          "",
          "Document the initial repository scaffold.",
          "Keep the staged snapshot review text verbatim.",
        ].join("\n");

        yield* commitApproved(snapshot, commitMessage);

        assert.strictEqual((yield* runGit(repoRoot, "rev-list", "--count", "--all")).trim(), "1");
        assert.strictEqual(
          (yield* runGit(repoRoot, "log", "-1", "--pretty=%B")).replace(/\n$/u, ""),
          commitMessage,
        );
      }),
  );

  it.effect(
    "commitApproved aborts before commit creation when the staged fingerprint changes during review",
    () =>
      Effect.gen(function* () {
        const repoRoot = yield* createRepository("gitai-git-repository-");

        yield* writeTextFile(resolve(repoRoot, "README.md"), "# gitai\n");
        yield* runGit(repoRoot, "add", "README.md");

        const snapshot = yield* loadSnapshot(repoRoot);

        yield* writeTextFile(resolve(repoRoot, "README.md"), "# gitai\n\nupdated during review\n");
        yield* runGit(repoRoot, "add", "README.md");

        const error = yield* commitApproved(snapshot, "feat: add README").pipe(Effect.flip);

        assert.strictEqual(error._tag, "IndexChangedDuringReviewError");
        if (error._tag !== "IndexChangedDuringReviewError") {
          return;
        }

        assert.strictEqual(error.repoRoot, repoRoot);
        assert.strictEqual((yield* runGit(repoRoot, "rev-list", "--count", "--all")).trim(), "0");
      }),
  );
});
