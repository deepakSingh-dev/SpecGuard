import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a throwaway git worktree on a scratch branch so generated code and
 * its tests run isolated from the real workspace. Best-effort symlinks
 * node_modules in from the source repo — a fresh worktree has none of its
 * own, and reinstalling per run would be far too slow.
 */
export async function createWorktree(repoRoot: string): Promise<string> {
  const branch = `specguard/scratch-${randomUUID().slice(0, 8)}`;
  const parentDir = await mkdtemp(path.join(tmpdir(), "specguard-worktree-"));
  const worktreePath = path.join(parentDir, "wt");

  await git(repoRoot, ["worktree", "add", "-b", branch, worktreePath]);

  const sourceNodeModules = path.join(repoRoot, "node_modules");
  if (await pathExists(sourceNodeModules)) {
    await symlink(sourceNodeModules, path.join(worktreePath, "node_modules"), "dir").catch(() => {});
  }

  return worktreePath;
}

/** Removes a worktree created by createWorktree, along with its scratch branch. */
export async function teardownWorktree(worktreePath: string): Promise<void> {
  let repoRoot: string | null = null;
  let branch: string | null = null;

  try {
    const commonDir = (
      await git(worktreePath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    ).stdout.trim();
    repoRoot = path.dirname(commonDir);
    branch = (await git(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  } catch {
    // Worktree metadata is already gone; nothing more we can look up.
  }

  if (repoRoot) {
    await git(repoRoot, ["worktree", "remove", "--force", worktreePath]).catch(() => {});
    if (branch) {
      await git(repoRoot, ["branch", "-D", branch]).catch(() => {});
    }
  }

  await rm(path.dirname(worktreePath), { recursive: true, force: true }).catch(() => {});
}

/** Writes a file (generated code or a generated test) into the worktree, creating parent dirs as needed. */
export async function writeWorktreeFile(
  worktreePath: string,
  relativePath: string,
  content: string
): Promise<string> {
  const fullPath = path.join(worktreePath, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
  return fullPath;
}
