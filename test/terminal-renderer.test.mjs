import assert from "node:assert/strict";
import test from "node:test";

import { renderCommitOutcome, renderCommitOperationalError } from "../src/commit/terminal.ts";
import {
  CommitMessageGeneratorError,
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
} from "../src/commit/errors.ts";

test("operational failures render to stderr-facing output", () => {
  const renders = [
    renderCommitOperationalError(
      new NotGitRepositoryError({
        cwd: "/tmp/not-a-repo",
      }),
    ),
    renderCommitOperationalError(
      new NoStagedChangesError({
        repoRoot: "/tmp/repo",
      }),
    ),
    renderCommitOperationalError(
      new CommitMessageGeneratorError({
        reason: "provider",
        message: "provider unavailable",
      }),
    ),
    renderCommitOperationalError(
      new IndexChangedDuringReviewError({
        repoRoot: "/tmp/repo",
      }),
    ),
    renderCommitOperationalError(
      new GitCommandError({
        command: ["git", "commit", "--file", "/tmp/msg"],
        message: "fatal: commit failed",
        exitCode: 1,
      }),
    ),
  ];

  for (const rendered of renders) {
    assert.equal(rendered.stream, "stderr");
    assert.match(rendered.text, /^ERROR\n  /u);
  }
});

test("reject is a stdout outcome rather than an operational error", () => {
  const rendered = renderCommitOutcome({
    _tag: "Rejected",
  });

  assert.equal(rendered.stream, "stdout");
  assert.equal(rendered.text, "Commit aborted without creating a commit.");
});
