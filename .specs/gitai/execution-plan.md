---
name: gitai
created_at: 2026-04-15T23:38:09Z
updated_at: 2026-04-15T23:39:22Z
generated_by:
  root_skill: execution-planning
  producing_skill: execution-planning
  skills_used:
    - execution-planning
    - write-execution-plan
  skill_graph:
    execution-planning:
      - write-execution-plan
    write-execution-plan: []
source_artifacts:
  charter: .specs/gitai/charter.md
  user_stories: .specs/gitai/user-stories.md
  requirements: .specs/gitai/requirements.md
  technical_design: .specs/gitai/technical-design.md
---

## Execution Summary

This plan coordinates the first implementation of `gitai commit` from an approved spec pack into a small set of build streams. The plan preserves the approved runtime-edge contract: generate one proposal from staged changes, allow only approve or reject, abort safely on invalid Git or provider conditions, and ship the CLI as a Bun-backed Effect v4 tool available on a user's PATH.

## Scope Alignment

- Charter: .specs/gitai/charter.md
- User Stories: .specs/gitai/user-stories.md
- Requirements: .specs/gitai/requirements.md
- Technical Design: .specs/gitai/technical-design.md
- Story capability areas: Generate Commit Proposal; Review the Proposed Message; Abort on Invalid Context or Generation Failure
- Story anchors: US1.1, US1.2, US1.3, US1.4, US1.5, US1.6, US1.7, US1.8
- Requirement anchors: FR1.1, FR1.2, FR1.3, FR1.4, FR1.5, FR1.6, FR1.7, FR1.8; NFR2.1, NFR2.2, NFR2.3, NFR2.4; TC3.1, TC3.2, TC3.3, TC3.4, TC3.5, TC3.6; DR4.1, DR4.2, DR4.3, DR4.4; IR5.1, IR5.2, IR5.3, IR5.4; DEP6.1, DEP6.2, DEP6.3, DEP6.4
- Design anchors: CommitCommand; CommitWorkflow; GitRepository; CommitMessageGenerator; Interfaces and Contracts; Failure and Recovery Strategy; Testing Strategy; Implementation Strategy
- Runtime-edge obligations: Preserve `gitai commit` as the only initial command surface; preserve zero-or-one instruction-string grammar; resolve repo state from the current working directory; show exactly one proposal before commit; allow only approve or reject at review time; write invalid-repo, no-staged-changes, and provider failures to stderr; create a commit only from the exact approved proposal after staged fingerprint revalidation.
- In-scope implementation objective: Deliver the first runnable `gitai commit` CLI with typed Git and provider boundaries, binary review flow, effect-native composition, Bun runtime execution, and repository-backed verification.

## Implementation Streams

### Stream 1: CLI foundation and runtime composition

- Objective: Establish the executable CLI shape, runtime dependencies, command grammar, typed shared contracts, and root composition so deeper feature streams have stable boundaries.
- Implements:
  - Generate Commit Proposal capability area
  - US1.2, US1.3
  - FR1.1, FR1.2, FR1.3
  - TC3.1, TC3.2, TC3.3, TC3.4, TC3.5
  - DEP6.2, DEP6.3
  - CommitCommand; Implementation Strategy
- Interfaces / failure concerns: `gitai commit` grammar, Bun entrypoint, PATH-facing package shape, typed command outcomes, stdout versus stderr rendering boundaries.
- Notes: The repository currently has an empty `src/index.ts` and no runtime Effect, Effect Platform, or AI dependencies, so this stream must land the executable skeleton and dependency graph before end-to-end feature wiring can stabilize.

### Stream 2: Git repository snapshot and commit boundary

- Objective: Implement `GitRepository` as the semantic boundary for repo discovery, staged snapshot loading, fingerprinting, and exact-message commit creation.
- Implements:
  - Generate Commit Proposal capability area
  - Review the Proposed Message capability area
  - Abort on Invalid Context or Generation Failure capability area
  - US1.1, US1.3, US1.4, US1.6, US1.7
  - FR1.1, FR1.4, FR1.6, FR1.7
  - DR4.1, DR4.2, DR4.3
  - IR5.1, IR5.2
  - GitRepository; Failure and Recovery Strategy
- Interfaces / failure concerns: Git child-process execution, not-a-repository detection, no-staged-changes detection, temp message file lifecycle, and staged fingerprint drift between review and commit.
- Notes: This stream should hide Git transport mechanics early so the workflow and tests can depend on semantic repository behavior instead of shell choreography.

### Stream 3: Proposal generation and provider boundary

- Objective: Implement `CommitMessageGenerator` with structured proposal generation, default Codex-medium configuration, optional instruction support, and typed provider failure mapping.
- Implements:
  - Generate Commit Proposal capability area
  - Abort on Invalid Context or Generation Failure capability area
  - US1.1, US1.2, US1.8
  - FR1.2, FR1.8
  - TC3.5, TC3.6
  - DR4.4
  - IR5.4
  - CommitMessageGenerator; Interfaces and Contracts
- Interfaces / failure concerns: prompt construction from staged snapshots, schema-validated response decoding, provider credentials and network failure mapping, and large-patch generation behavior.
- Notes: Keep model defaults and overrides behind one explicit configuration seam so provider policy can change later without rewriting command or workflow callers.

### Stream 4: Workflow integration, verification, and release hygiene

- Objective: Compose the full approve-or-reject flow, verify fail-closed behavior end to end, and close repository-level release obligations.
- Implements:
  - Review the Proposed Message capability area
  - Abort on Invalid Context or Generation Failure capability area
  - US1.4, US1.5, US1.6, US1.7, US1.8
  - FR1.3, FR1.4, FR1.5, FR1.6, FR1.7, FR1.8
  - NFR2.1, NFR2.2, NFR2.3, NFR2.4
  - IR5.3
  - CommitWorkflow; Testing Strategy
- Interfaces / failure concerns: binary review prompt behavior, stdout review display, stderr-only failure paths, no-commit guarantees after reject or error, and repo-root validation with `bun run check` plus one changeset.
- Notes: This stream should start only after Streams 1 through 3 expose stable service contracts; otherwise integration progress will hide boundary churn.

## Work Breakdown

### Stream 1: CLI foundation and runtime composition

- [x] Add the Bun-backed CLI entrypoint, package executable wiring, and required Effect runtime dependencies.
  - Traceability: US1.3; FR1.1; TC3.1, TC3.3, TC3.4; DEP6.2, DEP6.3; CommitCommand
  - Verification focus: `gitai commit` parses under Bun, exposes the intended command surface, and can be invoked as an installed CLI entrypoint.
- [x] Define shared typed contracts for command input, review outcomes, config, and stderr-facing operational errors.
  - Traceability: US1.2; FR1.2, FR1.3; NFR2.2, NFR2.3; Interfaces and Contracts
  - Verification focus: zero-or-one instruction input is enforced at the boundary, and command outcomes distinguish review flow from operational failure without illegal states.

### Stream 2: Git repository snapshot and commit boundary

- [x] Implement repository discovery plus staged snapshot loading behind `GitRepository`.
  - Traceability: US1.1, US1.3, US1.6, US1.7; FR1.1, FR1.6, FR1.7; DR4.1, DR4.2; IR5.1; GitRepository
  - Verification focus: temp-repo coverage proves current-working-directory repo resolution, staged diff capture, not-a-repo aborts, and no-staged-changes aborts.
- [x] Implement exact approved-message commit creation with temp-message-file delivery and fingerprint revalidation.
  - Traceability: US1.4; FR1.4; DR4.3; IR5.2; Failure and Recovery Strategy
  - Verification focus: approval creates one commit with the exact reviewed message only when the staged fingerprint is unchanged; drift aborts before commit.

### Stream 3: Proposal generation and provider boundary

- [x] Implement structured proposal generation from `StagedSnapshot` plus optional instruction string.
  - Traceability: US1.1, US1.2; FR1.2; DR4.4; TC3.6; CommitMessageGenerator
  - Verification focus: fake-model coverage proves staged patch plus optional instruction produce one decoded proposal and preserve the immutable review snapshot contract.
- [x] Map provider and model failures into typed operational errors and default the provider layer to Codex-medium configuration.
  - Traceability: US1.8; FR1.8; TC3.5, TC3.6; IR5.4; Interfaces and Contracts
  - Verification focus: provider failures surface as stderr-bound operational errors with no partial commit behavior and no silent fallback path.

### Stream 4: Workflow integration, verification, and release hygiene

- [x] Compose `CommitWorkflow` with binary review prompting and fail-closed approve-or-reject behavior.
  - Traceability: US1.4, US1.5, US1.6, US1.7, US1.8; FR1.3, FR1.4, FR1.5, FR1.6, FR1.7, FR1.8; NFR2.1, NFR2.2, NFR2.3; CommitWorkflow
  - Verification focus: approve creates the commit, reject aborts without one, and all invalid-context or provider failures reach stderr without side effects.
- [x] Complete integration coverage, repository validation, and release hygiene for the first implementation slice.
  - Traceability: NFR2.4; IR5.3; Testing Strategy; repository workflow constraints from AGENTS.md
  - Verification focus: temp-repo end-to-end tests, nested-directory manual smoke test, one changeset present, and `bun run check` passes from repo root.

## Dependency and Sequencing Strategy

- Prerequisites: Stream 1 must establish the executable runtime shape and shared contracts before the command can depend on semantic Git or provider services.
- Sequencing notes: Execute Stream 1 first. Once typed contracts and the root command exist, Streams 2 and 3 can proceed in parallel behind shared boundaries. Start Stream 4 only after Streams 2 and 3 expose stable `GitRepository` and `CommitMessageGenerator` seams, then close with repository-level validation and release hygiene.
- Coordination risks: generator proposal shape can drift from workflow rendering if shared contracts are not fixed early; Git error mapping can sprawl into command code if the repository boundary lands late; placeholder tests can create false progress unless temp-repo and fake-model coverage arrive before final validation.

## Validation Checkpoints

- Command checkpoint: the CLI accepts only `gitai commit` and `gitai commit "focus on test coverage"` as the one-instruction-string form, and rejects extra positional input.
- Git checkpoint: temp-repo tests cover not-a-repo, no-staged-changes, staged snapshot load, fingerprint drift, and exact approved-message commit creation.
- Generator checkpoint: fake-model tests cover prompt construction, optional instruction inclusion, structured decode, default Codex-medium configuration, and provider-error mapping.
- Workflow checkpoint: integration tests prove approve-creates-commit, reject-aborts-without-commit, and stderr-only failures for invalid repo state and provider errors.
- Repository checkpoint: one changeset exists for the implementation PR and `bun run check` passes from repo root.
- Manual checkpoint: smoke test from a nested repository directory confirms current-working-directory resolution and PATH-oriented CLI behavior.

## Risks and Mitigations

- Risk: late introduction of runtime dependencies and executable wiring will force cross-stream churn.
- Mitigation: finish Stream 1 before deep feature work and treat the CLI entrypoint plus shared contracts as a hard prerequisite.
- Risk: Git snapshot or temp-file mistakes can violate the exact-message and fail-closed guarantees.
- Mitigation: isolate Git behavior in `GitRepository`, verify it with temp-repo tests, and keep fingerprint revalidation in the service contract rather than the command edge.
- Risk: provider configuration, credentials, or network failures can be mistaken for workflow bugs.
- Mitigation: keep provider behavior inside `CommitMessageGenerator`, add fake-model coverage for local behavior, and require explicit stderr-path verification for real provider failures.

## Progress Tracking

- Status: Completed
- Active stream: None
- Notes: The first implementation slice is complete. `gitai commit` now ships as a Bun-backed Effect CLI with typed Git and provider boundaries, approve-or-reject workflow integration, nested-directory executable coverage, one changeset, and a passing repo-root `bun run check` gate.

## Further Notes

- Assumptions: Implementation will follow the current repo workflow constraints, including Bun as package manager, `bun run check` as completion gate, and one changeset for the implementation PR.
- Open questions: None.
- TODO: Confirm: None.
