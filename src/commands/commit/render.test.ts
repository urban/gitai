import { assert, describe, it } from "@effect/vitest";

import { renderCommitOutcome, renderCommitOperationalError } from "./render";
import {
  CommitMessageGeneratorError,
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
} from "../../errors/CommitError";

describe("commit renderers", () => {
  it("operational failures render to stderr-facing output", () => {
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
      assert.strictEqual(rendered.stream, "stderr");
      assert.match(rendered.text, /^ERROR\n  /u);
    }
  });

  it("reject is a stdout outcome rather than an operational error", () => {
    const rendered = renderCommitOutcome({
      _tag: "Rejected",
    });

    assert.strictEqual(rendered.stream, "stdout");
    assert.strictEqual(rendered.text, "Commit aborted without creating a commit.");
  });
});
