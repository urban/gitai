---
name: gitai
created_at: 2026-04-15T16:57:52Z
updated_at: 2026-04-15T16:57:52Z
generated_by:
  root_skill: specification-authoring
  producing_skill: requirements
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - requirements
    - write-requirements
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - requirements
    document-traceability: []
    artifact-naming: []
    requirements:
      - write-requirements
    write-requirements: []
source_artifacts:
  charter: .specs/gitai/charter.md
  user_stories: .specs/gitai/user-stories.md
---

## Functional Requirements

- FR1.1: The product shall provide a `gitai commit` command that inspects the enclosing Git repository for the current working directory, reads the currently staged changes, and generates exactly one commit-message proposal before any commit is attempted.
  - Story traceability: US1.1 Generate one proposal from staged changes; US1.3 Invoke from the current repo directory
- FR1.2: The `gitai commit` command shall accept zero or one optional free-form instruction string and include that string as additional commit-authoring guidance for the generation request.
  - Story traceability: US1.2 Add one instruction string
- FR1.3: After generating a proposal, the product shall present the proposal for review and accept only two user decisions for that proposal: approve or reject.
  - Story traceability: US1.1 Generate one proposal from staged changes; US1.4 Approve the proposal; US1.5 Reject the proposal
- FR1.4: If the user approves the proposal, the product shall create a Git commit using the exact proposed commit message and the already staged changes.
  - Story traceability: US1.4 Approve the proposal
- FR1.5: If the user rejects the proposal, the product shall abort the commit flow without creating a Git commit.
  - Story traceability: US1.5 Reject the proposal
- FR1.6: If the current working directory is not inside a Git repository, the product shall abort before generation, write a diagnostic error to stderr, and create no commit.
  - Story traceability: US1.6 Abort outside a Git repository
- FR1.7: If the enclosing Git repository has no staged changes, the product shall abort before generation, write a diagnostic error to stderr, and create no commit.
  - Story traceability: US1.7 Abort when nothing is staged
- FR1.8: If commit-message generation fails because of a model or provider error, the product shall abort the flow, write a diagnostic error to stderr, and create no commit.
  - Story traceability: US1.8 Abort on model or provider failure

## Non-Functional Requirements

- NFR2.1: The commit flow shall be fail-closed: no commit may be created before explicit approval or after rejection, invalid Git context, missing staged changes, or generation failure.
- NFR2.2: The generated proposal shall be reviewable before commit creation so the user can make an explicit approve-or-reject decision on the exact message to be used.
- NFR2.3: All abort paths in scope shall communicate failure through stderr rather than silently exiting or writing failure-only diagnostics to stdout.
- NFR2.4: The command shall behave consistently from any directory on the user's PATH by resolving repository state relative to the current working directory.

## Technical Constraints

- TC3.1: The supported command grammar for the initial release shall be `gitai commit` and `gitai commit "<instruction string>"`.
- TC3.2: The optional context input shall be a single positional free-form instruction string rather than a multi-step editor, retry loop, or structured flag set.
- TC3.3: The CLI shall be implemented as an Effect v4 native CLI tool and follow Effect native standards and best practices.
- TC3.4: Runtime execution shall use Bun.
- TC3.5: Provider interaction shall use Effect Platform abstractions for process, terminal, and integration boundaries instead of ad hoc boundary handling.
- TC3.6: Default commit-message generation shall target Codex with thinking level medium unless a later approved artifact changes that default.

## Data Requirements

- DR4.1: The only repository diff content in scope for commit-message generation shall be the currently staged changes from the resolved Git repository.
- DR4.2: Unstaged changes, untracked files, and unrelated repositories shall not be treated as commit-message input for the `gitai commit` flow.
- DR4.3: The proposal under review shall be treated as a single immutable message snapshot for that command invocation; approval and rejection shall apply to that exact snapshot.
- DR4.4: If provided, the optional instruction string shall be carried with the staged diff as generation input for the same proposal request.

## Integration Requirements

- IR5.1: The product shall integrate with local Git repository state to detect whether the current working directory is inside a Git repository and to determine whether staged changes exist.
- IR5.2: The product shall integrate with Git commit creation so approval results in a real repository commit with the approved message.
- IR5.3: The product shall integrate with terminal input and output to display the proposal, collect the approve-or-reject decision, and emit stderr diagnostics for in-scope abort paths.
- IR5.4: The product shall integrate with an LLM provider capable of handling Codex generation requests and surfacing model or provider failures as typed operational errors.

## Dependencies

- DEP6.1: Git shall be installed and accessible in the execution environment.
- DEP6.2: The `gitai` executable shall be installed on the user's PATH so it can be invoked from arbitrary shell locations.
- DEP6.3: Runtime support for Bun shall be available in the execution environment unless the product is later distributed as an equivalent Bun-backed standalone executable.
- DEP6.4: The execution environment shall provide the provider credentials, configuration, and network access required to request commit-message generation.

## Further Notes

- Assumptions: Users stage the intended changes before running `gitai commit`; repository commit permissions and Git user configuration are already valid for normal commit creation.
- Open questions: None.
- TODO: Confirm: None.
