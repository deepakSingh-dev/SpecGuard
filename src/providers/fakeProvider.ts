import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CompleteRequest,
  DelegateTaskRequest,
  DelegateTaskResult,
  Provider,
} from "./provider";

export interface FakeProviderConfig {
  id?: string;
  completeResponse?: string;
  delegateTaskResult?: DelegateTaskResult;
}

const DEMO_RELATIVE_PATH = "src/specguard-demo.ts";

const DEMO_CONSTRAINTS_RESPONSE = JSON.stringify({
  constraints: [
    {
      type: "functional",
      earsPattern: "ubiquitous",
      earsText: "The system shall expose a demo value of 42.",
      description: "Canned demo constraint used when no real provider is configured.",
      required: true,
      severity: 5,
    },
  ],
});

const DEMO_TEST_RESPONSE = JSON.stringify({
  testCases: [
    {
      constraintId: "demo",
      name: "exposes the demo value",
      description: "Verifies the canned demo file exports demoValue === 42.",
      testCode:
        'import { it, expect } from "vitest";\n' +
        'import { demoValue } from "../src/specguard-demo";\n' +
        'it("exposes the demo value", () => {\n' +
        "  expect(demoValue).toBe(42);\n" +
        "});\n",
      expectedOutcome: "demoValue === 42",
    },
  ],
});

const DEMO_SCORE_RESPONSE = JSON.stringify({
  overallScore: 88,
  dimensions: [
    { name: "correctness", score: 90, rationale: "Demo file matches the demo test.", suggestions: [] },
    { name: "completeness", score: 85, rationale: "Covers the one canned constraint.", suggestions: [] },
    { name: "type_safety", score: 90, rationale: "Fully typed TypeScript.", suggestions: [] },
    { name: "security", score: 85, rationale: "No external input.", suggestions: [] },
    { name: "maintainability", score: 88, rationale: "Trivial, readable demo output.", suggestions: [] },
    { name: "test_coverage", score: 90, rationale: "One test covers the one constraint.", suggestions: [] },
  ],
  compliant: true,
  blockingIssues: [],
  summary: "Canned demo report from FakeProvider — configure a real provider for actual scoring.",
});

/**
 * Deterministic, canned Provider used by every test in this codebase so
 * nothing ever hits a real model. When constructed without explicit
 * overrides (the default "fake" provider registered for every stage), it
 * also doubles as a working zero-config demo: it writes a real file into
 * the worktree and returns EARS/test/score JSON that matches it, so a full
 * pipeline run reaches "complete" without any provider configured.
 */
export class FakeProvider implements Provider {
  id: string;
  kind: "agent" | "model" = "model";
  capabilities = { canGenerateCode: true, canReason: true, streaming: false };

  private readonly completeResponse?: string;
  private readonly delegateTaskResult?: DelegateTaskResult;

  constructor(config: FakeProviderConfig = {}) {
    this.id = config.id ?? "fake";
    this.completeResponse = config.completeResponse;
    this.delegateTaskResult = config.delegateTaskResult;
  }

  async complete(req: CompleteRequest): Promise<string> {
    if (this.completeResponse !== undefined) {
      return this.completeResponse;
    }
    if (req.system.includes("requirements analyst")) {
      return DEMO_CONSTRAINTS_RESPONSE;
    }
    if (req.system.includes("test engineer")) {
      return DEMO_TEST_RESPONSE;
    }
    return DEMO_SCORE_RESPONSE;
  }

  async delegateTask(req: DelegateTaskRequest): Promise<DelegateTaskResult> {
    if (this.delegateTaskResult !== undefined) {
      return this.delegateTaskResult;
    }

    const filePath = path.join(req.worktreePath, DEMO_RELATIVE_PATH);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "export const demoValue = 42;\n", "utf8");

    return { filesWritten: [filePath], summary: "Wrote a canned demo file (src/specguard-demo.ts)." };
  }
}
