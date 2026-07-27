import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { PipelineState, TestCase } from "../models";
import { writeWorktreeFile } from "../worktree";
import type { PipelineContext } from "./context";

export type TestFramework = "vitest" | "pytest";

const DEFAULT_TIMEOUT_MS = 30_000;

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Detects the test framework from files in the worktree, unless a settings override forces one. */
export async function detectFramework(
  worktreePath: string,
  override: "auto" | TestFramework
): Promise<TestFramework> {
  if (override !== "auto") {
    return override;
  }

  if (await pathExists(path.join(worktreePath, "package.json"))) {
    return "vitest";
  }
  if (
    (await pathExists(path.join(worktreePath, "pyproject.toml"))) ||
    (await pathExists(path.join(worktreePath, "pytest.ini"))) ||
    (await pathExists(path.join(worktreePath, "setup.py")))
  ) {
    return "pytest";
  }

  return "vitest";
}

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runCommand(command: string, args: string[], cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(command, args, { cwd });
    } catch (err) {
      resolve({ exitCode: null, stdout: "", stderr: err instanceof Error ? err.message : String(err), timedOut: false });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut: false });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });
  });
}

function testFileFor(framework: TestFramework, testCase: TestCase): string {
  return framework === "vitest"
    ? `specguard-tests/${testCase.id}.test.ts`
    : `specguard-tests/test_${testCase.id.replace(/[^a-zA-Z0-9_]/g, "_")}.py`;
}

interface TestOutcome {
  passed: boolean;
  errorMessage: string | null;
  executionTimeMs: number;
}

async function runOneTest(
  framework: TestFramework,
  worktreePath: string,
  relativeFilePath: string,
  timeoutMs: number
): Promise<TestOutcome> {
  const start = Date.now();

  const { command, args } =
    framework === "vitest"
      ? { command: "npx", args: ["vitest", "run", relativeFilePath, "--reporter=basic"] }
      : { command: "python3", args: ["-m", "pytest", relativeFilePath, "-q"] };

  const result = await runCommand(command, args, worktreePath, timeoutMs);
  const executionTimeMs = Date.now() - start;

  if (result.timedOut) {
    return { passed: false, errorMessage: `Test timed out after ${timeoutMs}ms`, executionTimeMs };
  }

  if (result.exitCode === 0) {
    return { passed: true, errorMessage: null, executionTimeMs };
  }

  const output = `${result.stdout}\n${result.stderr}`.trim();
  const errorMessage = output.length > 0 ? truncate(output, 2000) : `Test process exited with code ${result.exitCode}`;
  return { passed: false, errorMessage, executionTimeMs };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Runs each generated test in its own subprocess, scoped to the worktree,
 * with a per-test timeout. One test erroring or hanging never aborts the
 * rest of the batch.
 */
export async function runTests(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  if (!state.worktreePath) {
    throw new Error("runTests: state.worktreePath must be set (create a worktree first).");
  }

  const worktreePath = state.worktreePath;
  const framework = await detectFramework(worktreePath, ctx.settings.testFramework);
  const timeoutMs = ctx.settings.testTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  const testCases: TestCase[] = [];
  for (const testCase of state.testCases) {
    const relativeFilePath = testFileFor(framework, testCase);
    try {
      await writeWorktreeFile(worktreePath, relativeFilePath, testCase.testCode);
      const outcome = await runOneTest(framework, worktreePath, relativeFilePath, timeoutMs);
      testCases.push({ ...testCase, ...outcome });
    } catch (err) {
      testCases.push({
        ...testCase,
        passed: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        executionTimeMs: null,
      });
    }
  }

  return { ...state, testCases };
}
