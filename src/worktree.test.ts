import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createWorktree, teardownWorktree, writeWorktreeFile } from "./worktree";

const execFileAsync = promisify(execFile);

async function createTempGitRepo(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "specguard-repo-"));
  await execFileAsync("git", ["init", "-q"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
  await writeFile(path.join(repoRoot, "README.md"), "# test repo\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-q", "-m", "initial"], { cwd: repoRoot });
  return repoRoot;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

describe("worktree", () => {
  let repoRoot: string | undefined;

  afterEach(async () => {
    if (repoRoot) {
      await rm(repoRoot, { recursive: true, force: true });
      repoRoot = undefined;
    }
  });

  it("creates an isolated worktree on a scratch branch, then tears it down cleanly", async () => {
    repoRoot = await createTempGitRepo();

    const worktreePath = await createWorktree(repoRoot);
    expect(await pathExists(worktreePath)).toBe(true);
    expect(await pathExists(path.join(worktreePath, "README.md"))).toBe(true);

    await writeWorktreeFile(worktreePath, "src/generated.ts", "export const x = 1;\n");
    expect(await pathExists(path.join(worktreePath, "src/generated.ts"))).toBe(true);

    await teardownWorktree(worktreePath);
    expect(await pathExists(worktreePath)).toBe(false);

    const { stdout } = await execFileAsync("git", ["branch", "--list", "specguard/scratch-*"], {
      cwd: repoRoot,
    });
    expect(stdout.trim()).toBe("");
  });
});
