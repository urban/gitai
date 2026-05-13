# gitai

`gitai` is a small CLI that writes a commit message from the staged git diff, asks for approval, then runs `git commit` with the approved message.

The current command surface is intentionally narrow: `gitai commit`.

## Requirements

- Bun 1.3.5 or newer
- Node.js 24.12 or newer
- Git
- Codex CLI available as `codex` and already authenticated

## Setup

Install dependencies and link the `gitai` binary into Bun's global bin directory:

```sh
bun install
bun link
```

Make sure Bun's global bin directory is on your user `PATH`:

```sh
export PATH="$HOME/.bun/bin:$PATH"
```

To persist that for zsh:

```sh
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
```

Verify the binary is available:

```sh
gitai --help
```

## Use

Stage the changes you want to commit, then run:

```sh
git add <files>
gitai commit
```

The command will:

1. read the staged diff
2. ask Codex for a structured commit message
3. validate the message format
4. print the message for review
5. commit only after you approve

To change diff context size:

```sh
gitai commit --contextLineOption 5
```

To troubleshoot a commit run, enable Effect debug logs:

```sh
DEBUG=true gitai commit
```

## Development

Run the full validation suite before handing off changes:

```sh
bun run check
```

Useful scripts:

```sh
bun run lint
bun run typecheck
bun run test
```

## Notes

- Only staged changes are used.
- Lockfiles, build output, coverage JSON, `.git`, `node_modules`, and similar generated paths are filtered out before prompt generation.
- If the staged index changes while the generated message is under review, the commit is refused.
