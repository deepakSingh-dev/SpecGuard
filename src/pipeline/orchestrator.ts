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
export type StatusChangeHook = (state: PipelineState) => void;

export interface OrchestratorOptions {
  repoRoot: string;
  /** Blocks the pipeline until the user approves the extracted constraints. Defaults to auto-approve. */
  onConstraintApproval?: ConstraintApprovalHook;
  /** Whether to remove the worktree after a successful, promoted run. Defaults to true. */
  teardownWorktreeOnSuccess?: boolean;
  /** Called after every status transition, letting UI surfaces show live progress. */
  onStatusChange?: StatusChangeHook;
}

const autoApprove: ConstraintApprovalHook = async (state) => state;
const noopStatusChange: StatusChangeHook = () => {};

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
  const onStatusChange = options.onStatusChange ?? noopStatusChange;

  let state = initState(specRequest);

  const setStatus = (status: PipelineState["status"]) => {
    state = { ...state, status };
    onStatusChange(state);
  };

  try {
    state.worktreePath = await createWorktree(options.repoRoot);
    setStatus("validating");

    state = await extractConstraints(state, ctx);
    state = await onConstraintApproval(state);

    for (let attempt = 0; attempt <= state.maxRetries; attempt++) {
      setStatus("generating_tests");
      state = await generateCode(state, ctx);
      state = await generateTests(state, ctx);

      setStatus("running_tests");
      state = await runTests(state, ctx);

      if (allTestsPassed(state)) {
        break;
      }
      if (attempt < state.maxRetries) {
        state.retryCount = attempt + 1;
      }
    }

    setStatus("scoring");
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
      state.error = null;
      if (teardownOnSuccess && state.worktreePath) {
        await teardownWorktree(state.worktreePath);
        state.worktreePath = null;
      }
      setStatus("complete");
    } else {
      state.error = gateResult.reasons.join(" ");
      // Worktree is intentionally left in place for inspection.
      setStatus("failed");
    }

    return state;
  } catch (err) {
    state = { ...state, error: err instanceof Error ? err.message : String(err) };
    setStatus("failed");
    return state;
  }
}
