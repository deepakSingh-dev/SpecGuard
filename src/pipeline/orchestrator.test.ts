import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { SpecRequest } from "../models";
import { ProviderRegistry } from "../providers/registry";
import type {
  CompleteRequest,
  DelegateTaskRequest,
  DelegateTaskResult,
  Provider,
} from "../providers/provider";
import { teardownWorktree } from "../worktree";
import type { PipelineContext } from "./context";
import { runPipeline } from "./orchestrator";

const execFileAsync = promisify(execFile);

async function createTempGitRepoWithNodeModules(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "specguard-orchestrator-repo-"));
  await execFileAsync("git", ["init", "-q"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
  await writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "tmp" }), "utf8");
  await writeFile(path.join(repoRoot, ".gitignore"), "node_modules/\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-q", "-m", "initial"], { cwd: repoRoot });

  await symlink(
    path.join(process.cwd(), "node_modules"),
    path.join(repoRoot, "node_modules"),
    "dir"
  );

  return repoRoot;
}

const specRequest: SpecRequest = {
  title: "Value flow",
  description: "Computes a value that must equal 2.",
  naturalLanguageSpec: "When queried, the system shall return the value 2.",
  targetLanguage: "auto",
  context: {},
};

function sixDimensionScore(overallScore: number) {
  const dims = [
    "correctness",
    "completeness",
    "type_safety",
    "security",
    "maintainability",
    "test_coverage",
  ];
  return {
    overallScore,
    dimensions: dims.map((name) => ({ name, score: overallScore, rationale: "r", suggestions: [] })),
    compliant: overallScore >= 75,
    blockingIssues: [],
    summary: "summary",
  };
}

/**
 * A scripted, stateful Provider (not the shared canned FakeProvider) so the
 * "retry then pass" test can make attempt 2 genuinely fix what attempt 1
 * got wrong, without hitting a real model.
 */
class ScriptedProvider implements Provider {
  id = "scripted";
  kind: "agent" | "model" = "agent";
  capabilities = { canGenerateCode: true, canReason: true, streaming: false };

  private generateCodeCalls = 0;

  constructor(private valuesByAttempt: number[], private overallScore: number) {}

  async complete(req: CompleteRequest): Promise<string> {
    if (req.system.includes("requirements analyst")) {
      return JSON.stringify({
        constraints: [
          {
            type: "functional",
            earsPattern: "event_driven",
            earsText: "When queried, the system shall return the value 2.",
            description: "Returns the correct value.",
            required: true,
            severity: 9,
          },
        ],
      });
    }
    if (req.system.includes("test engineer")) {
      return JSON.stringify({
        testCases: [
          {
            constraintId: "c1",
            name: "returns 2",
            description: "value equals 2",
            testCode:
              'import { it, expect } from "vitest";\nimport { value } from "../src/value";\nit("returns 2", () => {\n  expect(value).toBe(2);\n});\n',
            expectedOutcome: "value === 2",
          },
        ],
      });
    }
    return JSON.stringify(sixDimensionScore(this.overallScore));
  }

  async delegateTask(req: DelegateTaskRequest): Promise<DelegateTaskResult> {
    const index = Math.min(this.generateCodeCalls, this.valuesByAttempt.length - 1);
    const value = this.valuesByAttempt[index];
    this.generateCodeCalls += 1;

    const filePath = path.join(req.worktreePath, "src", "value.ts");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `export const value = ${value};\n`, "utf8");

    return { filesWritten: [filePath], summary: `Wrote value.ts with value=${value}` };
  }
}

function buildContext(provider: Provider): PipelineContext {
  const registry = new ProviderRegistry();
  registry.register(provider);
  return {
    registry,
    settings: {
      providers: {
        constraintExtraction: provider.id,
        codeGeneration: provider.id,
        testGeneration: provider.id,
        scoring: provider.id,
      },
      gate: { minScore: 75 },
      testFramework: "vitest",
    },
  };
}

describe("runPipeline", () => {
  let repoRoot: string | undefined;
  let worktreeToCleanUp: string | null | undefined;

  afterEach(async () => {
    if (worktreeToCleanUp) {
      await teardownWorktree(worktreeToCleanUp);
      worktreeToCleanUp = undefined;
    }
    if (repoRoot) {
      await rm(repoRoot, { recursive: true, force: true });
      repoRoot = undefined;
    }
  });

  it("reaches complete on a fully successful run", async () => {
    repoRoot = await createTempGitRepoWithNodeModules();
    const provider = new ScriptedProvider([2], 90);

    const result = await runPipeline(specRequest, buildContext(provider), {
      repoRoot,
      onConstraintApproval: async (state) => state,
    });
    worktreeToCleanUp = result.worktreePath;

    expect(result.status).toBe("complete");
    expect(result.error).toBeNull();
    expect(result.retryCount).toBe(0);
    expect(result.qualityReport?.overallScore).toBe(90);
  }, 60_000);

  it("recovers when the first attempt fails but a retry passes", async () => {
    repoRoot = await createTempGitRepoWithNodeModules();
    const provider = new ScriptedProvider([1, 2], 90);

    const result = await runPipeline(specRequest, buildContext(provider), {
      repoRoot,
      onConstraintApproval: async (state) => state,
    });
    worktreeToCleanUp = result.worktreePath;

    expect(result.status).toBe("complete");
    expect(result.retryCount).toBeGreaterThan(0);
  }, 60_000);

  it("ends failed when quality stays non-compliant through all retries", async () => {
    repoRoot = await createTempGitRepoWithNodeModules();
    const provider = new ScriptedProvider([1], 40);

    const result = await runPipeline(specRequest, buildContext(provider), {
      repoRoot,
      onConstraintApproval: async (state) => state,
    });
    worktreeToCleanUp = result.worktreePath;

    expect(result.status).toBe("failed");
    expect(result.error).toBeTruthy();
    expect(result.worktreePath).not.toBeNull();
  }, 90_000);
});
