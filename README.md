# gitai

`gitai` is a small CLI that writes Git commit messages from your staged diff.

Current scope:

- reads staged changes from the current Git repo
- asks `codex exec` for one commit proposal
- shows the proposal for review
- creates the commit only after approval

It does not inspect unstaged changes. It does not auto-commit without review.

## Requirements

- Bun `>= 1.3.5`
- Git
- Codex CLI on `PATH`
- Codex auth already set up

## Install

From this repo:

```sh
bun install
bun link
```

`bun link` installs the `gitai` executable into Bun's global bin dir.

## Add `gitai` to your shell `PATH`

Precision: the `PATH` entry should be Bun's global bin dir, not this repo root.

Find the dir:

```sh
bun pm bin -g
```

Usually it is:

```sh
$HOME/.bun/bin
```

### zsh

```sh
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify:

```sh
gitai --help
which gitai
```

## Use

Run inside a Git repo with staged changes:

```sh
gitai commit
```

Optional instruction:

```sh
gitai commit "focus on migration details"
```

Flow:

1. `gitai` loads the staged diff
2. `gitai` runs `codex exec`
3. `gitai` prints the proposed commit message
4. you approve or reject
5. on approval, `gitai` creates the commit

## Common failure cases

- not inside a Git repo
- no staged changes
- `codex` not installed
- `codex` not authenticated
- model output does not match expected commit schema
