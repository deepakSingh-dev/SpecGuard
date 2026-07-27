import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createWorktree, teardownWorktree } from "../worktree";
import { runTests } from "./runTests";
import { createBaseState, createContext } from "./testHelpers";
import { ProviderRegistry } from "../providers/registry";

const execFileAsync = promisify(execFile);

async function createTempGitRepoWithNodeModules(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "specguard-runtests-repo-"));
  await execFileAsync("git", ["init", "-q"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
  await writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "tmp" }), "utf8");
  await execFileAsync("git", ["add", "."], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-q", "-m", "initial"], { cwd: repoRoot });

  // Give the worktree access to vitest without a slow, network-dependent
  // `npm install` — reuse this project's own installed vitest binary.
  await symlink(
    path.join(process.cwd(), "node_modules"),
    path.join(repoRoot, "node_modules"),
    "dir"
  );

  return repoRoot;
}

describe("runTests", () => {
  let repoRoot: string | undefined;
  let worktreePath: string | undefined;

  afterEach(async () => {
    if (worktreePath) {
      await teardownWorktree(worktreePath);
      worktreePath = undefined;
    }
    if (repoRoot) {
      await rm(repoRoot, { recursive: true, force: true });
      repoRoot = undefined;
    }
  });

  it("runs a trivially passing and a trivially failing test and reports both", async () => {
    repoRoot = await createTempGitRepoWithNodeModules();
    worktreePath = await createWorktree(repoRoot);

    const state = createBaseState({
      worktreePath,
      testCases: [
        {
          id: "test-pass",
          constraintId: "c1",
          name: "passes",
          description: "trivially true",
          testCode: `import { it, expect } from "vitest";\nit("passes", () => {\n  expect(1).toBe(1);\n});\n`,
          expectedOutcome: "passes",
          passed: null,
          errorMessage: null,
          executionTimeMs: null,
        },
        {
          id: "test-fail",
          constraintId: "c2",
          name: "fails",
          description: "trivially false",
          testCode: `import { it, expect } from "vitest";\nit("fails", () => {\n  expect(1).toBe(2);\n});\n`,
          expectedOutcome: "fails",
          passed: null,
          errorMessage: null,
          executionTimeMs: null,
        },
      ],
    });

    const ctx = createContext(new ProviderRegistry(), "unused", { testFramework: "vitest" });
    const result = await runTests(state, ctx);

    const pass = result.testCases.find((t) => t.id === "test-pass");
    const fail = result.testCases.find((t) => t.id === "test-fail");

    expect(pass?.passed).toBe(true);
    expect(pass?.errorMessage).toBeNull();
    expect(pass?.executionTimeMs).toBeGreaterThanOrEqual(0);

    expect(fail?.passed).toBe(false);
    expect(fail?.errorMessage).toBeTruthy();
    expect(fail?.executionTimeMs).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
