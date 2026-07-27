import { randomUUID } from "node:crypto";
import type { PipelineState, SpecRequest } from "../models";
import { createWorktree, promoteWorktree, teardownWorktree } from "../worktree";
import type { PipelineContext } from "./context";
import { extractConstraints } from "./extractConstraints";
import { applyGate } from "./gate";
import { generateCode } from "./generateCode";
import { generateTests } from "./generateTests";
import { runTests } from "./runTests";
import { scoreQuality } from "./scoreQuality";

export type ConstraintApprovalHook = (state: PipelineState) => Promise<PipelineState>;

export interface OrchestratorOptions {
  repoRoot: string;
  /** Blocks the pipeline until the user approves the extracted constraints. Defaults to auto-approve. */
  onConstraintApproval?: ConstraintApprovalHook;
  /** Whether to remove the worktree after a successful, promoted run. Defaults to true. */
  teardownWorktreeOnSuccess?: boolean;
}

const autoApprove: ConstraintApprovalHook = async (state) => state;

function initState(specRequest: SpecRequest): PipelineState {
  return {
    specId: randomUUID(),
    specRequest,
    status: "pending",
    constraints: [],
    testCases: [],
    generatedCode: null,
    qualityReport: null,
    error: null,
    retryCount: 0,
    maxRetries: 2,
    worktreePath: null,
  };
}

function allTestsPassed(state: PipelineState): boolean {
  return state.testCases.length > 0 && state.testCases.every((t) => t.passed === true);
}

export async function runPipeline(
  specRequest: SpecRequest,
  ctx: PipelineContext,
  options: OrchestratorOptions
): Promise<PipelineState> {
  const onConstraintApproval = options.onConstraintApproval ?? autoApprove;
  const teardownOnSuccess = options.teardownWorktreeOnSuccess ?? true;

  let state = initState(specRequest);

  try {
    state.worktreePath = await createWorktree(options.repoRoot);
    state.status = "validating";

    state = await extractConstraints(state, ctx);
    state = await onConstraintApproval(state);

    for (let attempt = 0; attempt <= state.maxRetries; attempt++) {
      state.status = "generating_tests";
      state = await generateCode(state, ctx);
      state = await generateTests(state, ctx);

      state.status = "running_tests";
      state = await runTests(state, ctx);

      if (allTestsPassed(state)) {
        break;
      }
      if (attempt < state.maxRetries) {
        state.retryCount = attempt + 1;
      }
    }

    state.status = "scoring";
    state = await scoreQuality(state, ctx);

    const gateResult = applyGate(
      state.qualityReport!,
      ctx.settings.gate.minScore,
      state.constraints,
      state.testCases
    );

    if (gateResult.passed) {
      if (state.worktreePath) {
        await promoteWorktree(state.worktreePath, options.repoRoot);
      }
      state.status = "complete";
      state.error = null;
      if (teardownOnSuccess && state.worktreePath) {
        await teardownWorktree(state.worktreePath);
        state.worktreePath = null;
      }
    } else {
      state.status = "failed";
      state.error = gateResult.reasons.join(" ");
      // Worktree is intentionally left in place for inspection.
    }

    return state;
  } catch (err) {
    state.status = "failed";
    state.error = err instanceof Error ? err.message : String(err);
    return state;
  }
}
