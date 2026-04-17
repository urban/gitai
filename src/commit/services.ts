import { Context, Effect } from "effect";

import type { CommitProposal, StagedSnapshot } from "./contracts.ts";
import type {
  CommitMessageGeneratorError,
  GitCommandError,
  IndexChangedDuringReviewError,
  NoStagedChangesError,
  NotGitRepositoryError,
} from "./errors.ts";

export class GitRepository extends Context.Service<
  GitRepository,
  {
    loadSnapshot(
      cwd: string,
    ): Effect.Effect<
      StagedSnapshot,
      NotGitRepositoryError | NoStagedChangesError | GitCommandError
    >;
    commitApproved(
      snapshot: StagedSnapshot,
      commitMessage: string,
    ): Effect.Effect<void, IndexChangedDuringReviewError | GitCommandError>;
  }
>()("@urban/gitai/commit/GitRepository") {}

export class CommitMessageGenerator extends Context.Service<
  CommitMessageGenerator,
  {
    generate(
      snapshot: StagedSnapshot,
      instruction: string | undefined,
    ): Effect.Effect<CommitProposal, CommitMessageGeneratorError>;
  }
>()("@urban/gitai/commit/CommitMessageGenerator") {}
