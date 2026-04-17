import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const createTempDirectory = () => realpathSync(mkdtempSync(join(tmpdir(), "gitai-cli-")));

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
  const entrypointPath = resolve(process.cwd(), "src", "cli.ts");

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

  return { binDirectory };
};

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
