---
name: gitai
created_at: 2026-04-15T23:43:17Z
updated_at: 2026-04-15T23:43:17Z
generated_by:
  root_skill: task-generation
  producing_skill: task-generation
  skills_used:
    - task-generation
    - write-task-tracking
  skill_graph:
    task-generation:
      - write-task-tracking
    write-task-tracking: []
source_artifacts:
  execution_plan: .specs/gitai/execution-plan.md
---

## Task Summary

- Parent plan: .specs/gitai/execution-plan.md
- Scope: Implement the first approved `gitai commit` slice across CLI composition, Git snapshot and commit behavior, proposal generation, workflow integration, and repo-level verification.
- Tracking intent: Use this document as the local execution tracker for thin production-bound slices; advance task status only when the listed acceptance criteria are demonstrably satisfied.
- Story / requirement / design anchors: Generate Commit Proposal; Review the Proposed Message; Abort on Invalid Context or Generation Failure; US1.1-US1.8; FR1.1-FR1.8; NFR2.1-NFR2.4; CommitCommand; CommitWorkflow; GitRepository; CommitMessageGenerator.
- Runtime-edge obligations: Preserve `gitai commit` as the only initial command surface, accept zero or one instruction string, resolve repo state from the current working directory, show one proposal before commit, allow only approve or reject, route invalid-repo and no-staged-changes and provider failures to stderr, and create a commit only from the exact approved proposal after fingerprint revalidation.

## Stream Groups

### Stream 1: CLI foundation and runtime composition

Objective: Establish a runnable Bun-backed Effect CLI with typed boundaries that later streams can plug into without reworking the command edge.

#### Task CLI-01

- Title: Boot the `gitai commit` command under Bun with the approved grammar
- Status: Not started
- Blocked by: None
- Plan references:
  - Stream 1: CLI foundation and runtime composition
  - Work item: Add the Bun-backed CLI entrypoint, package executable wiring, and required Effect runtime dependencies.
  - Anchors: US1.3; FR1.1; TC3.1, TC3.3, TC3.4; CommitCommand
- What to build: A real executable entrypoint that boots with Bun, exposes `gitai commit`, accepts zero or one instruction string, and rejects extra positional input before any feature workflow runs.
- Acceptance criteria:
  - `package.json` exposes an executable path and the repo includes the runtime dependencies needed to start the Effect CLI under Bun.
  - Running the command through Bun demonstrates that `gitai commit` and `gitai commit "focus on test coverage"` parse successfully while an extra positional argument path is rejected.
- Notes:
  - This is the first tracer bullet because it creates an observable CLI surface that all later slices can wire through.

#### Task CLI-02

- Title: Define shared command contracts, config, and stderr-facing operational errors
- Status: Not started
- Blocked by: CLI-01
- Plan references:
  - Stream 1: CLI foundation and runtime composition
  - Work item: Define shared typed contracts for command input, review outcomes, config, and stderr-facing operational errors.
  - Anchors: US1.2; FR1.2, FR1.3; NFR2.2, NFR2.3; Interfaces and Contracts
- What to build: Shared schema-backed command types and error families that distinguish review outcomes from operational failures and give downstream streams one stable boundary contract.
- Acceptance criteria:
  - The codebase contains typed input, proposal, decision, outcome, and error contracts with no illegal-state escape hatches at the command boundary.
  - Unit coverage proves the renderer sends operational failures to stderr-facing paths and does not model reject as an operational error.
- Notes:
  - Keep model defaults injectable at this layer so generator policy can vary without changing callers.

### Stream 2: Git repository snapshot and commit boundary

Objective: Deliver semantic Git behavior for repo discovery, staged snapshot loading, and exact-message commit creation behind one service seam.

#### Task GIT-01

- Title: Load a staged snapshot from the current working directory
- Status: Not started
- Blocked by: CLI-02
- Plan references:
  - Stream 2: Git repository snapshot and commit boundary
  - Work item: Implement repository discovery plus staged snapshot loading behind `GitRepository`.
  - Anchors: US1.1, US1.3, US1.6, US1.7; FR1.1, FR1.6, FR1.7; DR4.1, DR4.2; IR5.1; GitRepository
- What to build: `GitRepository.loadSnapshot` that resolves repo scope from cwd, returns staged patch plus fingerprint for valid repos, and fails with typed not-a-repo or no-staged-changes errors when preconditions are not met.
- Acceptance criteria:
  - Temp-repo tests prove nested-directory repo resolution, staged patch capture, and fingerprint creation for a valid staged change set.
  - Temp-repo tests also prove typed failure paths for not-a-repository and no-staged-changes cases without any commit side effect.
- Notes:
  - Keep Git child-process details hidden inside the service boundary.

#### Task GIT-02

- Title: Commit the exact approved message with fingerprint revalidation
- Status: Not started
- Blocked by: GIT-01
- Plan references:
  - Stream 2: Git repository snapshot and commit boundary
  - Work item: Implement exact approved-message commit creation with temp-message-file delivery and fingerprint revalidation.
  - Anchors: US1.4; FR1.4; DR4.3; IR5.2; Failure and Recovery Strategy
- What to build: `GitRepository.commitApproved` that revalidates the staged fingerprint, writes the approved message through a temp file, and creates one Git commit only when the reviewed snapshot still matches.
- Acceptance criteria:
  - Temp-repo coverage proves approval creates one commit whose stored message exactly matches the approved proposal, including multiline formatting.
  - Temp-repo coverage proves fingerprint drift aborts before commit creation and leaves repository history unchanged.
- Notes:
  - Keep temp-file cleanup scoped so failed and successful runs both release local artifacts.

### Stream 3: Proposal generation and provider boundary

Objective: Turn a staged snapshot into one schema-validated proposal through an isolated provider seam with explicit Codex-medium defaults.

#### Task AI-01

- Title: Generate one structured proposal from staged diff plus optional instruction
- Status: Not started
- Blocked by: CLI-02, GIT-01
- Plan references:
  - Stream 3: Proposal generation and provider boundary
  - Work item: Implement structured proposal generation from `StagedSnapshot` plus optional instruction string.
  - Anchors: US1.1, US1.2; FR1.2; DR4.4; TC3.6; CommitMessageGenerator
- What to build: `CommitMessageGenerator.generate` backed by a schema-validated response model that consumes the staged snapshot and optional instruction string and returns one immutable proposal.
- Acceptance criteria:
  - Fake-model tests prove the staged patch and optional instruction both contribute to the request payload used for one proposal generation call.
  - Fake-model tests prove the generator returns exactly one decoded proposal object suitable for later review and commit rendering.
- Notes:
  - Keep the proposal shape stable enough for workflow integration and exact-message commit delivery.

#### Task AI-02

- Title: Add the real Codex-medium provider layer and typed provider failure mapping
- Status: Not started
- Blocked by: AI-01
- Plan references:
  - Stream 3: Proposal generation and provider boundary
  - Work item: Map provider and model failures into typed operational errors and default the provider layer to Codex-medium configuration.
  - Anchors: US1.8; FR1.8; TC3.5, TC3.6; IR5.4; Interfaces and Contracts
- What to build: The real OpenAI-backed generator layer with Codex-family model selection, medium reasoning effort defaults, and error mapping that turns provider failures into typed operational errors.
- Acceptance criteria:
  - The application layer provides a real generator implementation whose defaults are explicitly set to the approved Codex-medium policy.
  - Test coverage proves provider or model failures map to the command error surface without any implicit retry loop or partial commit path.
- Notes:
  - Keep provider credentials and network concerns out of command and workflow code.

### Stream 4: Workflow integration, verification, and release hygiene

Objective: Compose the full review workflow, verify fail-closed behavior end to end, and close repo-level release obligations.

#### Task FLOW-01

- Title: Compose the approve-or-reject workflow across CLI, Git, and generator boundaries
- Status: Not started
- Blocked by: GIT-02, AI-02
- Plan references:
  - Stream 4: Workflow integration, verification, and release hygiene
  - Work item: Compose `CommitWorkflow` with binary review prompting and fail-closed approve-or-reject behavior.
  - Anchors: US1.4, US1.5, US1.6, US1.7, US1.8; FR1.3, FR1.4, FR1.5, FR1.6, FR1.7, FR1.8; NFR2.1, NFR2.2, NFR2.3; CommitWorkflow
- What to build: The integrated workflow that loads the staged snapshot, generates one proposal, renders it for binary review, commits only on approval, and routes reject or operational failure to the correct outcome path.
- Acceptance criteria:
  - Integration coverage proves approve creates a commit, reject exits without one, and the review loop does not offer edit or retry states.
  - Integration coverage proves invalid repo, no staged changes, provider failure, and fingerprint drift all reach stderr-facing failure output without creating a commit.
- Notes:
  - This slice should wire real services through the command edge, not bypass the runtime composition root.

#### Task REL-01

- Title: Close verification, changeset, and repo-root validation for the first release slice
- Status: Not started
- Blocked by: FLOW-01
- Plan references:
  - Stream 4: Workflow integration, verification, and release hygiene
  - Work item: Complete integration coverage, repository validation, and release hygiene for the first implementation slice.
  - Anchors: NFR2.4; IR5.3; Testing Strategy; repository workflow constraints from AGENTS.md
- What to build: Final repository-level checks for the initial implementation, including remaining temp-repo integration coverage, manual smoke notes, one changeset, and a passing repo-root verification run.
- Acceptance criteria:
  - The repository contains the required changeset and `bun run check` passes from repo root after the implementation work lands.
  - Execution notes or test coverage demonstrate the command works from a nested repository directory and remains usable as a PATH-oriented CLI.
- Notes:
  - This task closes the slice; do not mark it complete until the repo-root validation gate passes.

## Dependency Map

- CLI-01 -> None
- CLI-02 -> CLI-01
- GIT-01 -> CLI-02
- GIT-02 -> GIT-01
- AI-01 -> CLI-02, GIT-01
- AI-02 -> AI-01
- FLOW-01 -> GIT-02, AI-02
- REL-01 -> FLOW-01

## Tracking Notes

- Active stream: Stream 1: CLI foundation and runtime composition
- Global blockers: None
- TODO: Confirm: None
