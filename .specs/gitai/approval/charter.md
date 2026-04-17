# Approval View

## Goals and Non-Goals

- Goals:
  - Provide a `gitai commit` CLI flow that turns staged Git changes into one proposed commit message for user review.
  - Allow one optional free-form instruction string to shape commit-message generation.
  - Keep the decision binary: approve creates the commit; reject aborts without one.
  - Support PATH-based CLI use from any working directory inside a Git repository.
- Non-Goals:
  - In-tool editing or iterative rewriting of the generated commit message.
  - Git staging workflows, unstaged-change review, or other Git subcommands.
  - Non-Git repositories or other version-control systems.
  - Additional review states beyond approve or reject.

## Actors and Personas in Scope

- Developer
  - Role: Terminal user who wants faster commit authoring for already staged changes.
  - Relevance: Primary reviewer who approves or rejects the proposed commit message.
- Local Git repository
  - Role: Repository discovered from the current working directory.
  - Relevance: Supplies the only staged diff in scope and receives the eventual commit.
- LLM provider/model runtime
  - Role: External generation dependency.
  - Relevance: Produces the proposal or fails the flow before commit creation.

## Success Criteria that Define Done

- A developer inside a Git repository with staged changes can run `gitai commit` and receive exactly one generated commit-message proposal.
- One optional free-form instruction string can shape that proposal.
- Approval creates the Git commit with the proposed message and rejection aborts without a commit.
- Invalid repo context, missing staged changes, or generation failure writes an error to stderr and creates no commit.
- The installed CLI can be invoked from any directory on the user's PATH while resolving repo state from the current working directory.
- Default generation uses Codex with thinking level set to medium.

## Decisions Required for Approval

- Scope baseline
  - Approve this charter as the scope baseline for the initial `gitai` slice: one staged-diff-driven commit flow only.
- Review contract
  - Approve binary review only: approve creates the commit and reject aborts without a commit.
- Default generation policy
  - Approve Codex with thinking level medium as the default generation behavior for this slice.

## Scope Risks and Open Questions

- Provider failure is an accepted stop condition for the first release; the tool aborts instead of guessing or auto-retrying.
- Excluding in-tool editing keeps the first slice tight, but any message refinement stays outside this CLI flow.

## Traceability Map

- [T1] Claim: The product scope is one CLI commit flow that turns staged Git changes into a proposed commit message.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/charter.md :: Goals
  - Evidence quote: "- Provide a `gitai commit` CLI flow that turns currently staged Git changes into a proposed commit message for user review."
- [T2] Claim: The user may supply one optional free-form instruction string to influence generation.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/charter.md :: Goals
  - Evidence quote: "- Let the user optionally supply one free-form instruction string to shape commit-message generation."
- [T3] Claim: The review outcome is intentionally binary: approve creates the commit and reject aborts it.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/charter.md :: Success Criteria
  - Evidence quote: "- SC1.3: The flow allows only two terminal outcomes after generation: approve creates the Git commit with the proposed message, and reject aborts without creating a commit."
- [T4] Claim: In-tool message editing is explicitly out of scope for the initial slice.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/charter.md :: Non-Goals
  - Evidence quote: "- In-tool editing or iterative rewriting of the generated commit message."
- [T5] Claim: Default generation behavior uses Codex with thinking level medium.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/charter.md :: Success Criteria
  - Evidence quote: "- SC1.6: Default commit-message generation uses Codex with thinking level set to medium when the user does not override behavior with extra instruction text."

## Validator Status

- Canonical validator:
  - Command: bash .agents/skills/write-charter/scripts/validate_charter.sh .specs/gitai/charter.md
  - Result: Passed
- Approval-view validator:
  - Command: bash .agents/skills/write-approval-view/scripts/validate_approval_view.sh artifact .specs/gitai/charter.md .specs/gitai/approval/charter.md .specs/gitai/approval/charter.html
  - Result: Passed

## Downstream Impact if Approved

- User stories can treat the staged-diff flow, binary review, and PATH-scoped invocation as fixed product scope.
- Requirements can freeze Codex-medium default generation and fail-closed error behavior without reopening charter scope.
- Technical design can assume commit-message editing, broader Git workflows, and extra review states remain out of scope.

## Snapshot Identity

- Review type: Artifact
- Approval mode: Initial
- Canonical artifact: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/charter.md
- Snapshot SHA-256: 630c23c14c9672362bfa448fbf7fbfb6e57e6fdbcf649d328720eabd1c3ff073
- Canonical updated_at: 2026-04-15T12:54:58Z
- Approval view generated_at: 2026-04-16T20:50:28Z
