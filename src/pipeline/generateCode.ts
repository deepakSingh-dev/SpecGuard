import type { PipelineState } from "../models";
import type { PipelineContext } from "./context";

export async function generateCode(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  if (!state.worktreePath) {
    throw new Error("generateCode: state.worktreePath must be set (create a worktree first).");
  }

  const provider = ctx.registry.resolve(ctx.settings.providers.codeGeneration);
  if (!provider.delegateTask) {
    throw new Error(
      `generateCode: provider "${provider.id}" does not implement delegateTask().`
    );
  }

  const constraintsBlock = state.constraints
    .map((c) => `- [${c.earsPattern}] (${c.type}, severity ${c.severity}) ${c.earsText}`)
    .join("\n");

  const priorFailures = state.testCases.filter((t) => t.passed === false);
  const failureContext = priorFailures.length
    ? `\n\nThe previous attempt failed these tests. Fix the underlying implementation so they pass:\n${priorFailures
        .map((t) => `- ${t.name}: ${t.errorMessage ?? "failed"}`)
        .join("\n")}`
    : "";

  const prompt = `Implement code that satisfies the following approved EARS constraints for "${state.specRequest.title}":\n\n${constraintsBlock}${failureContext}`;

  const result = await provider.delegateTask({
    prompt,
    worktreePath: state.worktreePath,
    constraints: state.constraints,
  });

  return {
    ...state,
    generatedCode: result.summary,
  };
}
