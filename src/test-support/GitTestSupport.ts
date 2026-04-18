import { Effect } from "effect";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type CommandResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

const formatCommandFailure = (result: CommandResult): string => {
  const stderr = result.stderr.trim();

  if (stderr !== "") {
    return stderr;
  }

  const stdout = result.stdout.trim();

  return stdout !== "" ? stdout : "command failed";
};

export const createTempDirectory = (prefix: string) =>
  Effect.acquireRelease(
    Effect.sync(() => realpathSync(mkdtempSync(join(tmpdir(), prefix)))),
    (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );

export const runCommand = Effect.fn("GitTestSupport.runCommand")(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
  },
) {
  const result = yield* Effect.sync(() =>
    spawnSync(command, [...args], {
      cwd: options.cwd,
      encoding: "utf8",
      env: options.env,
    }),
  );

  if (result.error !== undefined) {
    return yield* Effect.fail(result.error);
  }

  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  } satisfies CommandResult;
});

export const runCommandOrFail = Effect.fn("GitTestSupport.runCommandOrFail")(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
  },
) {
  const result = yield* runCommand(command, args, options);

  if (result.exitCode !== 0) {
    return yield* Effect.fail(new Error(formatCommandFailure(result)));
  }

  return result.stdout;
});

export const runGit = Effect.fn("GitTestSupport.runGit")(function* (
  cwd: string,
  ...args: Array<string>
) {
  return yield* runCommandOrFail("git", args, { cwd });
});

export const writeTextFile = Effect.fn("GitTestSupport.writeTextFile")(function* (
  path: string,
  contents: string,
  options?: {
    readonly mode?: number;
  },
) {
  yield* Effect.sync(() => {
    if (options?.mode === undefined) {
      writeFileSync(path, contents, { encoding: "utf8" });
      return;
    }

    writeFileSync(path, contents, {
      encoding: "utf8",
      mode: options.mode,
    });
  });
});

export const createRepository = Effect.fn("GitTestSupport.createRepository")(function* (
  prefix = "gitai-repository-",
) {
  const repoRoot = yield* createTempDirectory(prefix);

  yield* runGit(repoRoot, "init");
  yield* runGit(repoRoot, "config", "user.name", "Gitai Test");
  yield* runGit(repoRoot, "config", "user.email", "gitai@example.com");

  return repoRoot;
});

export const createPathExecutable = Effect.fn("GitTestSupport.createPathExecutable")(function* (
  entrypointPath: string,
) {
  const binDirectory = yield* createTempDirectory("gitai-cli-bin-");
  const executablePath = resolve(binDirectory, "gitai");

  yield* writeTextFile(executablePath, `#!/bin/sh\nexec bun "${entrypointPath}" "$@"\n`, {
    mode: 0o755,
  });

  return { binDirectory };
});
