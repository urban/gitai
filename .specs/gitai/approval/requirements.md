# Approval View

## Highest-Impact Obligations

- Proposal creation from staged changes
  - FR1.1 and DR4.1 require `gitai commit` to resolve the current repository, read the staged diff, and generate exactly one proposal before any commit attempt.
- Binary review bound to one immutable proposal
  - FR1.3-FR1.5 and DR4.3 require approve-or-reject review only and bind both decisions to the exact proposal snapshot under review.
- Fail-closed abort behavior
  - FR1.6-FR1.8 and NFR2.1-NFR2.3 require stderr diagnostics and no commit for invalid repo context, missing staged changes, and provider failure.
- Fixed first-release technical stack
  - TC3.1-TC3.6 fix the command grammar, one optional instruction string, Effect v4 native CLI, Bun runtime, Effect Platform boundaries, and default Codex-medium generation.
- Required runtime integrations and dependencies
  - IR5.1-IR5.4 and DEP6.1-DEP6.4 make Git, terminal IO, provider connectivity, PATH access, and Bun-backed runtime support part of the release contract.

## Data, Integration, and Validation Hotspots

| Hotspot                      | Requirement anchors                        | Approval read                                                                                         |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Command grammar              | TC3.1, TC3.2                               | The first release supports only `gitai commit` with zero or one positional instruction string.        |
| Repository snapshot boundary | FR1.1, DR4.1, DR4.2, IR5.1                 | Only the currently staged changes from the resolved Git repository are input to generation.           |
| Review and commit gating     | FR1.3, FR1.4, FR1.5, DR4.3, IR5.2          | Review is binary and commit creation may use only the exact approved proposal.                        |
| Failure signaling            | FR1.6, FR1.7, FR1.8, NFR2.1, NFR2.3, IR5.3 | Invalid repo state and provider failure abort with stderr diagnostics and no commit.                  |
| Provider integration         | IR5.4, TC3.6, DEP6.4                       | Generation depends on a Codex-capable provider path with the required credentials and network access. |
| Runtime platform             | TC3.3, TC3.4, TC3.5, DEP6.2, DEP6.3        | Effect v4, Effect Platform abstractions, Bun, and PATH invocation are fixed execution constraints.    |

## Constraints that Shape Design

- The approved command grammar is only `gitai commit` and `gitai commit "instruction string"`.
- The optional context input stays a single positional free-form instruction string instead of an editor, retry loop, or structured flag set.
- The CLI must be implemented as an Effect v4 native CLI tool.
- Runtime execution must use Bun.
- Process, terminal, and integration boundaries must use Effect Platform abstractions.
- Default generation must target Codex with thinking level medium unless a later approved artifact changes that default.
- Only the currently staged changes from the resolved repository are in scope for generation input.
- Approval and rejection apply to one immutable proposal snapshot per command invocation.

## Decisions Required for Approval

- Command surface
  - Approve the fixed first-release grammar and the zero-or-one instruction-string input shape.
- Review contract
  - Approve binary review and the immutable proposal snapshot model as the stable behavioral contract.
- Technical direction
  - Approve Effect v4, Effect Platform boundaries, Bun, and default Codex-medium generation as design-shaping constraints.

## Requirement Risks and TODO: Confirm Items

- Provider credentials, configuration, and network access remain explicit runtime dependencies for proposal generation.
- Git installation, PATH access for `gitai`, and Bun availability remain explicit execution-environment prerequisites.

## Traceability Map

- [T1] Claim: The command must generate exactly one proposal from the staged diff before any commit attempt.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/requirements.md :: Functional Requirements
  - Evidence quote: "- FR1.1: The product shall provide a `gitai commit` command that inspects the enclosing Git repository for the current working directory, reads the currently staged changes, and generates exactly one commit-message proposal before any commit is attempted."
- [T2] Claim: The review flow is restricted to approve or reject, with approval creating the commit and rejection aborting it.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/requirements.md :: Functional Requirements
  - Evidence quote: "- FR1.3: After generating a proposal, the product shall present the proposal for review and accept only two user decisions for that proposal: approve or reject."
- [T3] Claim: Missing repo context, missing staged changes, and provider-model failures must abort with stderr diagnostics and no commit.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/requirements.md :: Functional Requirements
  - Evidence quote: "- FR1.8: If commit-message generation fails because of a model or provider error, the product shall abort the flow, write a diagnostic error to stderr, and create no commit."
- [T4] Claim: The initial release restricts extra authoring context to one positional free-form instruction string rather than a richer input model.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/requirements.md :: Technical Constraints
  - Evidence quote: "- TC3.2: The optional context input shall be a single positional free-form instruction string rather than a multi-step editor, retry loop, or structured flag set."
- [T5] Claim: Effect v4, Bun, Effect Platform boundaries, and Codex-medium default generation are explicit technical constraints.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/requirements.md :: Technical Constraints
  - Evidence quote: "- TC3.6: Default commit-message generation shall target Codex with thinking level medium unless a later approved artifact changes that default."

## Validator Status

- Canonical validator:
  - Command: bash .agents/skills/write-requirements/scripts/validate_requirements.sh .specs/gitai/requirements.md
  - Result: Passed
- Approval-view validator:
  - Command: bash .agents/skills/write-approval-view/scripts/validate_approval_view.sh artifact .specs/gitai/requirements.md .specs/gitai/approval/requirements.md .specs/gitai/approval/requirements.html
  - Result: Passed

## Downstream Impact if Approved

- Technical design can now freeze service seams, runtime composition, and integration behavior against a stable requirement baseline.
- Execution planning can sequence work against stable FR, NFR, TC, DR, IR, and DEP identifiers.
- Implementation validation can test the fail-closed review contract and exact-message commit behavior against named obligations instead of prose summaries.

## Snapshot Identity

- Review type: Artifact
- Approval mode: Initial
- Canonical artifact: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/requirements.md
- Snapshot SHA-256: 3982144bebceadb77aeba18dd4e1676b0d694aeefd2e8b1b9543a98c1cc99eb0
- Canonical updated_at: 2026-04-15T16:57:52Z
- Approval view generated_at: 2026-04-16T20:50:28Z
