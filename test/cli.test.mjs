import assert from "node:assert/strict";
import test from "node:test";

import { validateCommitGrammar } from "../src/cli.ts";

test("parses gitai commit without an instruction", () => {
  assert.equal(validateCommitGrammar(["commit"]), undefined);
});

test("parses gitai commit with one instruction string", () => {
  assert.equal(validateCommitGrammar(["commit", "focus on test coverage"]), undefined);
});

test("rejects extra positional arguments for gitai commit", () => {
  assert.equal(
    validateCommitGrammar(["commit", "focus on test coverage", "extra-input"]),
    "gitai commit accepts zero or one optional instruction string",
  );
});
