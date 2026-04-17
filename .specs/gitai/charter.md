---
name: gitai
created_at: 2026-04-15T12:54:58Z
updated_at: 2026-04-15T12:54:58Z
generated_by:
  root_skill: specification-authoring
  producing_skill: charter
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - charter
    - write-charter
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - charter
    document-traceability: []
    artifact-naming: []
    charter:
      - write-charter
    write-charter: []
source_artifacts: {}
---

## Goals

- Provide a `gitai commit` CLI flow that turns currently staged Git changes into a proposed commit message for user review.
- Let the user optionally supply one free-form instruction string to shape commit-message generation.
- Keep the commit decision binary: approve to create the commit with the proposed message, or reject to abort without creating a commit.
- Make the tool usable as a system-wide CLI from any directory on a user's PATH, with behavior scoped to the current working directory's Git repository.

## Non-Goals

- In-tool editing or iterative rewriting of the generated commit message.
- Managing Git staging, reviewing unstaged changes, or supporting other Git subcommands beyond the initial commit flow.
- Supporting non-Git repositories or version-control systems other than Git.
- Offering multiple approval states beyond approve or reject for the generated commit proposal.

## Personas / Actors

- Developer: a Git user working in a terminal who wants faster, accurate commit authoring for already staged changes.
- Local Git repository: the repository discovered from the current working directory whose staged changes are the only input diff in scope.
- LLM provider/model runtime: the external generation dependency that produces the proposed commit message and can fail the operation.

## Success Criteria

- SC1.1: A developer inside a Git repository with staged changes can run `gitai commit` and receive exactly one generated commit-message proposal derived from the staged diff.
- SC1.2: A developer can run `gitai commit "<instruction string>"` to add one optional free-form instruction string that influences the generated proposal.
- SC1.3: The flow allows only two terminal outcomes after generation: approve creates the Git commit with the proposed message, and reject aborts without creating a commit.
- SC1.4: If the current working directory is not inside a Git repository, if no changes are staged, or if model/provider generation fails, the tool aborts and writes an error to stderr without creating a commit.
- SC1.5: The installed CLI can be invoked from any directory on the user's PATH and evaluates repository state relative to the current working directory.
- SC1.6: Default commit-message generation uses Codex with thinking level set to medium when the user does not override behavior with extra instruction text.
