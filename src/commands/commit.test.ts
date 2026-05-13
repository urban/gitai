// @effect-diagnostics asyncFunction:off
// @effect-diagnostics globalTimers:off
// @effect-diagnostics newPromise:off
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics processEnv:off
import { existsSync } from "fs";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, delimiter, join } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type CommandResult = Readonly<{
  exitCode: number;
  output: string;
  stderr: string;
  stdout: string;
}>;

type CodexMode = "success" | "fail";

type RunGitaiCommitOptions = Readonly<{
  cwd: string;
  codexMode: CodexMode;
  calledFilepath: string;
  debug?: boolean | undefined;
  input?: string | undefined;
}>;

const cliFilepath = fileURLToPath(new URL("../cli.ts", import.meta.url));

const ansiCsiPattern = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, "g");
const ansiSingleCharacterPattern = new RegExp(String.raw`\u001B[@-Z\\-_]`, "g");

const stripTerminalCodes = (output: string) =>
  output.replace(ansiCsiPattern, "").replace(ansiSingleCharacterPattern, "").replace(/\r/g, "");

const runCommand = ({
  args,
  command,
  cwd,
  env,
  input,
  timeoutMs = 15_000,
}: {
  args: ReadonlyArray<string>;
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv | undefined;
  input?: string | undefined;
  timeoutMs?: number | undefined;
}): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? 1,
        output: stripTerminalCodes(`${stdout}${stderr}`),
        stderr: stripTerminalCodes(stderr),
        stdout: stripTerminalCodes(stdout),
      });
    });

    if (input !== undefined) {
      child.stdin.end(input);
      return;
    }

    child.stdin.end();
  });

const fileExists = (filepath: string): boolean => existsSync(filepath);

const createGitRepo = async () => {
  const repo = await mkdtemp(join(tmpdir(), "gitai-commit-"));
  await runGit(repo, ["init", "-q"]);
  await runGit(repo, ["config", "user.email", "test@example.com"]);
  await runGit(repo, ["config", "user.name", "Test User"]);
  return repo;
};

const runGit = async (cwd: string, args: ReadonlyArray<string>) =>
  runCommand({
    args,
    command: "git",
    cwd,
  });

const hasHeadCommit = async (cwd: string) => {
  const result = await runGit(cwd, ["rev-parse", "--verify", "HEAD"]);
  return result.exitCode === 0;
};

const hasStagedChanges = async (cwd: string) => {
  const result = await runGit(cwd, ["diff", "--staged", "--quiet"]);
  return result.exitCode === 1;
};

const getHeadCommitSubject = async (cwd: string) => {
  const result = await runGit(cwd, ["log", "-1", "--pretty=%s"]);
  return result.stdout.trim();
};

const stageFile = async (cwd: string, filepath: string, contents: string) => {
  const fullFilepath = join(cwd, filepath);
  await mkdir(dirname(fullFilepath), { recursive: true });
  await writeFile(fullFilepath, contents);
  await runGit(cwd, ["add", filepath]);
};

describe("gitai commit", () => {
  const tempDirectories: Array<string> = [];
  let codexDirectory = "";

  beforeAll(async () => {
    codexDirectory = await mkdtemp(join(tmpdir(), "gitai-codex-stub-"));
    tempDirectories.push(codexDirectory);

    await writeFile(
      join(codexDirectory, "codex"),
      `#!/usr/bin/env bash
set -euo pipefail

mode="\${GITAI_TEST_CODEX_MODE:-success}"
called_file="\${GITAI_TEST_CODEX_CALLED_FILE:-}"
output_filepath=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      output_filepath="$2"
      shift 2
      ;;
    --output-schema)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -n "$called_file" ]]; then
  printf 'called\n' >> "$called_file"
fi

cat > /dev/null

case "$mode" in
  success)
    printf '{"message":"Add fake commit"}\n' > "$output_filepath"
    ;;
  fail)
    printf 'codex exploded\n' >&2
    exit 17
    ;;
  *)
    printf 'unsupported codex mode: %s\n' "$mode" >&2
    exit 1
    ;;
esac
`,
      { mode: 0o755 },
    );
  });

  afterAll(async () => {
    await Promise.all(
      tempDirectories.map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  const runGitaiCommit = async ({
    calledFilepath,
    codexMode,
    cwd,
    debug,
    input,
  }: RunGitaiCommitOptions) => {
    const env = {
      ...process.env,
      ...(debug === undefined ? {} : { DEBUG: String(debug) }),
      GITAI_TEST_CODEX_CALLED_FILE: calledFilepath,
      GITAI_TEST_CODEX_MODE: codexMode,
      PATH: `${codexDirectory}${delimiter}${process.env.PATH ?? ""}`,
    };

    return runCommand({
      args: ["run", cliFilepath, "commit"],
      command: "bun",
      cwd,
      env,
      input,
    });
  };

  it("creates a commit after approval", async () => {
    const repo = await createGitRepo();
    tempDirectories.push(repo);
    await stageFile(repo, "hello.txt", "hello\n");

    const calledFilepath = join(repo, "codex-called.txt");
    const result = await runGitaiCommit({
      calledFilepath,
      codexMode: "success",
      cwd: repo,
      input: "y\n",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Generated Commit Message");
    expect(result.output).toContain("Add fake commit");
    expect(result.output).toContain("Successfully committed changes!");
    expect(await fileExists(calledFilepath)).toBe(true);
    expect(await getHeadCommitSubject(repo)).toBe("Add fake commit");
    expect(await hasStagedChanges(repo)).toBe(false);
  });

  it("does not create a commit after rejection", async () => {
    const repo = await createGitRepo();
    tempDirectories.push(repo);
    await stageFile(repo, "hello.txt", "hello\n");

    const calledFilepath = join(repo, "codex-called.txt");
    const result = await runGitaiCommit({
      calledFilepath,
      codexMode: "success",
      cwd: repo,
      input: "n\n",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Generated Commit Message");
    expect(result.output).toContain("Add fake commit");
    expect(result.output).not.toContain("Successfully committed changes!");
    expect(await fileExists(calledFilepath)).toBe(true);
    expect(await hasHeadCommit(repo)).toBe(false);
    expect(await hasStagedChanges(repo)).toBe(true);
  });

  it("fails cleanly outside a git repo", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "gitai-not-repo-"));
    tempDirectories.push(cwd);

    const calledFilepath = join(cwd, "codex-called.txt");
    const result = await runGitaiCommit({
      calledFilepath,
      codexMode: "success",
      cwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Not inside a git repository");
    expect(result.output).not.toContain("Would you like to commit with this message?");
    expect(result.output).not.toContain("at <anonymous>");
    expect(await fileExists(calledFilepath)).toBe(false);
  });

  it("fails cleanly when no staged changes exist", async () => {
    const repo = await createGitRepo();
    tempDirectories.push(repo);

    const calledFilepath = join(repo, "codex-called.txt");
    const result = await runGitaiCommit({
      calledFilepath,
      codexMode: "success",
      cwd: repo,
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("No staged changes found");
    expect(result.output).not.toContain("Generated Commit Message");
    expect(result.output).not.toContain("Would you like to commit with this message?");
    expect(result.output).not.toContain("at <anonymous>");
    expect(await fileExists(calledFilepath)).toBe(false);
    expect(await hasHeadCommit(repo)).toBe(false);
  });

  it("fails cleanly when codex fails", async () => {
    const repo = await createGitRepo();
    tempDirectories.push(repo);
    await stageFile(repo, "hello.txt", "hello\n");

    const calledFilepath = join(repo, "codex-called.txt");
    const result = await runGitaiCommit({
      calledFilepath,
      codexMode: "fail",
      cwd: repo,
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Codex exited with code 17");
    expect(result.output).not.toContain("[Debug]");
    expect(result.output).not.toContain("Would you like to commit with this message?");
    expect(result.output).not.toContain("at <anonymous>");
    expect(await fileExists(calledFilepath)).toBe(true);
    expect(await hasHeadCommit(repo)).toBe(false);
    expect(await hasStagedChanges(repo)).toBe(true);
  });

  it("emits Effect debug logs when DEBUG is enabled", async () => {
    const repo = await createGitRepo();
    tempDirectories.push(repo);
    await stageFile(repo, "hello.txt", "hello\n");

    const calledFilepath = join(repo, "codex-called.txt");
    const result = await runGitaiCommit({
      calledFilepath,
      codexMode: "fail",
      cwd: repo,
      debug: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[Debug] Starting gitai commit");
    expect(result.output).toContain("[Debug] Running git command");
    expect(result.output).toContain("[Debug] Codex command exited");
    expect(result.output).toContain("command=commit");
    expect(result.output).toContain("service=CliAgent");
    expect(result.output).toContain("Codex exited with code 17");
    expect(await fileExists(calledFilepath)).toBe(true);
    expect(await hasHeadCommit(repo)).toBe(false);
    expect(await hasStagedChanges(repo)).toBe(true);
  });
});
