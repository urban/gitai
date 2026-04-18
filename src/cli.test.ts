import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { createPathExecutable, createRepository, runCommand } from "./test-support/GitTestSupport";

describe("cli", () => {
  it.effect(
    "the PATH-style gitai executable fails from a nested repository directory after resolving the repo root",
    () =>
      Effect.gen(function* () {
        const repoRoot = yield* createRepository("gitai-cli-");
        const nestedWorkingDirectory = resolve(repoRoot, "packages", "feature");
        const entrypointPath = resolve(process.cwd(), "src", "cli.ts");
        const { binDirectory } = yield* createPathExecutable(entrypointPath);

        yield* Effect.sync(() => {
          mkdirSync(nestedWorkingDirectory, { recursive: true });
        });

        const result = yield* runCommand("gitai", ["commit"], {
          cwd: nestedWorkingDirectory,
          env: {
            ...process.env,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "test-openai-api-key",
            PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
          },
        });

        assert.strictEqual(result.stdout, "");
        assert.strictEqual(result.stderr, `ERROR\n  No staged changes were found in ${repoRoot}\n`);
      }),
  );
});
