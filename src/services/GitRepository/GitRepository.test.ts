// @effect-diagnostics asyncFunction:off
// @effect-diagnostics globalTimers:off
// @effect-diagnostics newPromise:off
// @effect-diagnostics nodeBuiltinImport:off
import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Result } from "effect";
import { spawn } from "child_process";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { afterAll } from "vitest";
import { GitRepository } from "./GitRepository";

const tempDirectories: Array<string> = [];

const run = (cwd: string, args: ReadonlyArray<string>): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: "ignore" });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`git ${args.join(" ")} exited with code ${code ?? 1}`));
    });
  });

const createRepo = async () => {
  const repo = await mkdtemp(join(tmpdir(), "gitai-repository-"));
  tempDirectories.push(repo);
  await run(repo, ["init", "-q"]);
  await run(repo, ["config", "user.email", "test@example.com"]);
  await run(repo, ["config", "user.name", "Test User"]);
  return repo;
};

const stageFile = async (cwd: string, filepath: string, contents: string) => {
  const fullFilepath = join(cwd, filepath);
  await mkdir(dirname(fullFilepath), { recursive: true });
  await writeFile(fullFilepath, contents);
  await run(cwd, ["add", filepath]);
};

const TestLayer = GitRepository.layer.pipe(Layer.provide(BunServices.layer));

const provideTestLayer = <A, E>(effect: Effect.Effect<A, E, GitRepository>) =>
  effect.pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(TestLayer),
  );

afterAll(async () => {
  await Promise.all(
    tempDirectories.map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("GitRepository", () => {
  it.effect("loads staged snapshots from nested directories", () =>
    provideTestLayer(
      Effect.gen(function* () {
        const repo = yield* Effect.promise(() => createRepo());
        yield* Effect.promise(() => stageFile(repo, "src/hello.txt", "hello\n"));

        const git = yield* GitRepository;
        const snapshot = yield* git.loadSnapshot(join(repo, "src"), 3);

        assert.strictEqual(basename(snapshot.repoRoot), basename(repo));
        assert.include(snapshot.stagedPatch, "hello.txt");
        assert.isAbove(snapshot.indexFingerprint.length, 0);
      }),
    ),
  );

  it.effect("detects index drift before commit", () =>
    provideTestLayer(
      Effect.gen(function* () {
        const repo = yield* Effect.promise(() => createRepo());
        yield* Effect.promise(() => stageFile(repo, "hello.txt", "hello\n"));

        const git = yield* GitRepository;
        const result = yield* git.loadSnapshot(repo, 3).pipe(
          Effect.tap(() => Effect.promise(() => stageFile(repo, "other.txt", "other\n"))),
          Effect.flatMap((snapshot) => git.commitApproved(snapshot, "Add hello file")),
          Effect.result,
        );

        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.strictEqual(result.failure._tag, "IndexChangedDuringReviewError");
        }
      }),
    ),
  );
});
