---
name: gitai
created_at: 2026-04-15T14:15:38Z
updated_at: 2026-04-15T14:16:15Z
generated_by:
  root_skill: specification-authoring
  producing_skill: user-story-authoring
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - user-story-authoring
    - write-user-stories
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - user-story-authoring
    document-traceability: []
    artifact-naming: []
    user-story-authoring:
      - write-user-stories
    write-user-stories: []
source_artifacts:
  charter: .specs/gitai/charter.md
---

# User Stories

## Capability Area: Generate Commit Proposal

### Story: Generate one proposal from staged changes

- Story ID: US1.1
- Actor: Developer
- Situation: The developer is inside a Git repository, has already staged changes, and wants a commit message without writing it manually.
- Action: The developer runs `gitai commit`.
- Outcome: The developer receives one commit-message proposal grounded in the staged diff.
- Observation: The CLI prints one proposed commit message and waits for the developer to approve or reject it.

### Story: Add one instruction string

- Story ID: US1.2
- Actor: Developer
- Situation: The developer wants the generated commit message to emphasize a specific intent, concern, or framing.
- Action: The developer runs `gitai commit "focus on test coverage"` with one optional free-form instruction string.
- Outcome: The developer gets a proposal shaped by both the staged diff and the added instruction.
- Observation: The proposed message reflects the supplied instruction and still ends in the same approve-or-reject review step.

### Story: Invoke from the current repo directory

- Story ID: US1.3
- Actor: Developer
- Situation: The developer has `gitai` installed on the system PATH and is working from a repository directory or nested subdirectory.
- Action: The developer runs `gitai commit` from the current shell location.
- Outcome: The developer can use the same CLI without changing directories or doing repo-local setup.
- Observation: The proposal is generated from the enclosing repository's staged changes for the current working directory.

## Capability Area: Review the Proposed Message

### Story: Approve the proposal

- Story ID: US1.4
- Actor: Developer
- Situation: The developer is shown a generated commit-message proposal that matches the staged changes.
- Action: The developer approves the proposal.
- Outcome: The staged changes are committed with the exact proposed message.
- Observation: A new Git commit is created and the committed message matches the approved proposal.

### Story: Reject the proposal

- Story ID: US1.5
- Actor: Developer
- Situation: The developer is shown a generated commit-message proposal that they do not want to use.
- Action: The developer rejects the proposal.
- Outcome: The commit flow stops without creating a commit.
- Observation: The command exits after rejection and no new Git commit appears.

## Capability Area: Abort on Invalid Context or Generation Failure

### Story: Abort outside a Git repository

- Story ID: US1.6
- Actor: Developer
- Situation: The developer runs `gitai commit` from a current working directory that is not inside a Git repository.
- Action: The developer starts the commit flow.
- Outcome: The developer gets a clear failure instead of a generated proposal or commit.
- Observation: The CLI writes an error to stderr and exits without creating a commit.

### Story: Abort when nothing is staged

- Story ID: US1.7
- Actor: Developer
- Situation: The developer runs `gitai commit` inside a Git repository but has no staged changes.
- Action: The developer starts the commit flow.
- Outcome: The developer is told the commit flow cannot continue yet.
- Observation: The CLI writes an error to stderr and exits without generating a proposal or creating a commit.

### Story: Abort on model or provider failure

- Story ID: US1.8
- Actor: Developer
- Situation: The developer runs `gitai commit` with staged changes, but the commit-message generation call fails.
- Action: The developer starts the commit flow.
- Outcome: The developer gets a visible failure instead of a partial or guessed commit result.
- Observation: The CLI writes an error to stderr and exits without creating a commit.
