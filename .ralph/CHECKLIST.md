# Checklist

Refs:

- Plan: [`@.specs/gitai/execution-plan.md`](../.specs/gitai/execution-plan.md)
- Tasks: [`@.specs/gitai/execution-tasks.md`](../.specs/gitai/execution-tasks.md)

Execution rule: complete tasks in order. Do not start the next task until the current task is checked off and its verification step passes.

## Stream 1: CLI foundation and runtime composition

- [x] CLI-01 — Boot the `gitai commit` command under Bun with the approved grammar
- [x] CLI-02 — Define shared command contracts, config, and stderr-facing operational errors

## Stream 2: Git repository snapshot and commit boundary

- [x] GIT-01 — Load a staged snapshot from the current working directory
- [x] GIT-02 — Commit the exact approved message with fingerprint revalidation

## Stream 3: Proposal generation and provider boundary

- [x] AI-01 — Generate one structured proposal from staged diff plus optional instruction
- [x] AI-02 — Add the real Codex-medium provider layer and typed provider failure mapping

## Stream 4: Workflow integration, verification, and release hygiene

- [x] FLOW-01 — Compose the approve-or-reject workflow across CLI, Git, and generator boundaries
- [x] REL-01 — Close verification, changeset, and repo-root validation for the first release slice
