# Approval View

## Capability Map in Scope

- Generate Commit Proposal
  - Role: Covers staged-diff proposal generation, one optional instruction string, and invocation from the current repo context.
  - Relevance: Defines the front half of the initial `gitai commit` experience.
- Review the Proposed Message
  - Role: Covers the approve-or-reject decision after the proposal is shown.
  - Relevance: Locks the review surface to one binary decision gate.
- Abort on Invalid Context or Generation Failure
  - Role: Covers not-a-repo, no-staged-changes, and provider-failure exits.
  - Relevance: Defines the visible failure paths that preserve the fail-closed contract.

## Story Anchors and Observable Outcomes

- US1.1 + US1.3: Generate one proposal from the staged diff in the current repository context.
  - Observable outcome: The CLI prints one proposal for the enclosing repository and waits for approval or rejection.
- US1.2: One optional instruction string shapes the proposal.
  - Observable outcome: The proposed message reflects the supplied instruction and still enters the same review step.
- US1.4: Approval creates a Git commit with the exact proposed message.
  - Observable outcome: A new commit appears and its message matches the reviewed proposal.
- US1.5: Rejection aborts without creating a commit.
  - Observable outcome: The command exits and no new Git commit appears.
- US1.6-US1.8: Invalid repo context, missing staged changes, and provider failure abort before commit creation.
  - Observable outcome: The CLI writes an error to stderr and exits without a proposal-derived commit.

## Boundary and Failure Coverage

| Focus                      | Story anchors | Observable check                                                    |
| -------------------------- | ------------- | ------------------------------------------------------------------- |
| Proposal generation        | US1.1, US1.3  | One proposal is produced from staged changes in the enclosing repo. |
| Optional instruction input | US1.2         | One free-form instruction string can shape the proposal request.    |
| Approval and rejection     | US1.4, US1.5  | Review ends in either one exact-message commit or no commit at all. |
| Invalid repo context       | US1.6         | The CLI aborts with an error on stderr outside a Git repository.    |
| Missing staged changes     | US1.7         | The CLI aborts with an error on stderr when nothing is staged.      |
| Provider failure           | US1.8         | The CLI aborts with an error on stderr when generation fails.       |

## Decisions Required for Approval

- Story completeness
  - Approve this story set as the complete user-visible behavior baseline for the first `gitai commit` release.
- Review contract
  - Confirm the user-visible decision remains binary: approve or reject only.
- Failure coverage
  - Confirm the three explicit abort stories cover the intended invalid-context and generation-failure cases before requirements harden them.

## Story Gaps and TODO: Confirm Items

- None

## Traceability Map

- [T1] Claim: The primary flow is to generate one proposal from staged changes and wait for approval or rejection.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/user-stories.md :: Capability Area: Generate Commit Proposal
  - Evidence quote: "- Observation: The CLI prints one proposed commit message and waits for the developer to approve or reject it."
- [T2] Claim: The CLI supports one optional free-form instruction string that shapes the proposal.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/user-stories.md :: Capability Area: Generate Commit Proposal
  - Evidence quote: "- Outcome: The developer gets a proposal shaped by both the staged diff and the added instruction."
- [T3] Claim: Approving the proposal creates a Git commit with the exact proposed message.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/user-stories.md :: Capability Area: Review the Proposed Message
  - Evidence quote: "- Outcome: The staged changes are committed with the exact proposed message."
- [T4] Claim: Rejecting the proposal aborts the flow without creating a commit.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/user-stories.md :: Capability Area: Review the Proposed Message
  - Evidence quote: "- Outcome: The commit flow stops without creating a commit."
- [T5] Claim: The artifact includes explicit abort stories for invalid repo context, missing staged changes, and model or provider failure.
  - Source: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/user-stories.md :: Capability Area: Abort on Invalid Context or Generation Failure
  - Evidence quote: "### Story: Abort on model or provider failure"

## Validator Status

- Canonical validator:
  - Command: bash .agents/skills/write-user-stories/scripts/validate_user_stories.sh .specs/gitai/user-stories.md
  - Result: Passed
- Approval-view validator:
  - Command: bash .agents/skills/write-approval-view/scripts/validate_approval_view.sh artifact .specs/gitai/user-stories.md .specs/gitai/approval/user-stories.md .specs/gitai/approval/user-stories.html
  - Result: Passed

## Downstream Impact if Approved

- Requirements can derive FR, NFR, and failure obligations from stable `US1.x` anchors instead of informal flow notes.
- Technical design can map approval, rejection, and abort paths onto explicit CLI states and service seams.
- Execution planning can treat the visible user journey as frozen while sequencing implementation work.

## Snapshot Identity

- Review type: Artifact
- Approval mode: Initial
- Canonical artifact: /Users/urbanfaubion/.supacode/repos/gitai/init-authoring/.specs/gitai/user-stories.md
- Snapshot SHA-256: aac6f61a7dbadee2b1a2916195fd7933ac040eecbee4046632639f2c200cf554
- Canonical updated_at: 2026-04-15T14:16:15Z
- Approval view generated_at: 2026-04-16T20:50:28Z
