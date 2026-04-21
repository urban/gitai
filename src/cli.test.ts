import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  createPathExecutable,
  createRepository,
  createTempDirectory,
  runCommand,
} from "./test-support/GitTestSupport";

const createCliEnv = (binDirectory: string): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
  };

  delete env.OPENAI_API_KEY;

  return env;
};

const createCliBinary = () => createPathExecutable(resolve(process.cwd(), "src", "cli.ts"));

describe("cli", () => {
  it.effect("gitai --help renders without OPENAI_API_KEY", () =>
    Effect.gen(function* () {
      const workingDirectory = yield* createTempDirectory("gitai-cli-help-");
      const { binDirectory } = yield* createCliBinary();

      const result = yield* runCommand("gitai", ["--help"], {
        cwd: workingDirectory,
        env: createCliEnv(binDirectory),
      });

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.stderr, "");
      assert.match(result.stdout, /Author Git commits from staged changes/u);
      assert.match(result.stdout, /commit\s+Generate a commit proposal from the staged diff/u);
    }),
  );

  it.effect("gitai commit outside a repository reports the repo error before provider config", () =>
    Effect.gen(function* () {
      const workingDirectory = yield* createTempDirectory("gitai-not-a-repo-");
      const { binDirectory } = yield* createCliBinary();

      const result = yield* runCommand("gitai", ["commit"], {
        cwd: workingDirectory,
        env: createCliEnv(binDirectory),
      });

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.stdout, "");
      assert.strictEqual(
        result.stderr,
        `ERROR\n  Current directory is not inside a Git repository: ${workingDirectory}\n`,
      );
    }),
  );

  it.effect(
    "the PATH-style gitai executable fails from a nested repository directory after resolving the repo root",
    () =>
      Effect.gen(function* () {
        const repoRoot = yield* createRepository("gitai-cli-");
        const nestedWorkingDirectory = resolve(repoRoot, "packages", "feature");
        const { binDirectory } = yield* createCliBinary();

        yield* Effect.sync(() => {
          mkdirSync(nestedWorkingDirectory, { recursive: true });
        });

        const result = yield* runCommand("gitai", ["commit"], {
          cwd: nestedWorkingDirectory,
          env: createCliEnv(binDirectory),
        });

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(result.stdout, "");
        assert.strictEqual(result.stderr, `ERROR\n  No staged changes were found in ${repoRoot}\n`);
      }),
  );
});
