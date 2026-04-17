import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");
const cliEntry = resolve(repoRoot, "src/index.ts");

const runCli = (...args) => {
  const result = spawnSync("bun", ["run", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  return result;
};

test("parses gitai commit without an instruction", () => {
  const result = runCli("commit");

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("parses gitai commit with one instruction string", () => {
  const result = runCli("commit", "focus on test coverage");

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("rejects extra positional arguments for gitai commit", () => {
  const result = runCli("commit", "focus on test coverage", "extra-input");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERROR/u);
});
