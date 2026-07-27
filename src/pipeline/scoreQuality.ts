import { z } from "zod";
import type { PipelineState, QualityReport } from "../models";
import type { PipelineContext } from "./context";
import { parseJsonResponse } from "./jsonResponse";

const DIMENSION_NAMES = [
  "correctness",
  "completeness",
  "type_safety",
  "security",
  "maintainability",
  "test_coverage",
] as const;

const ScoreResponseSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(0).max(100),
      rationale: z.string(),
      suggestions: z.array(z.string()).default([]),
    })
  ),
  compliant: z.boolean(),
  blockingIssues: z.array(z.string()).default([]),
  summary: z.string(),
});

export async function scoreQuality(
  state: PipelineState,
  ctx: PipelineContext
): Promise<PipelineState> {
  const provider = ctx.registry.resolve(ctx.settings.providers.scoring);
  if (!provider.complete) {
    throw new Error(`scoreQuality: provider "${provider.id}" does not implement complete().`);
  }

  const system = `You are a strict code quality reviewer. Score the generated code against the approved
constraints and their test results across exactly these six dimensions: ${DIMENSION_NAMES.join(", ")}.
Each dimension score and the overallScore are 0-100. A submission is compliant only when
overallScore >= ${ctx.settings.gate.minScore} AND no constraint with severity >= 8 has a failing test.
Respond with ONLY a JSON object of this shape, no prose, no markdown fence:
{"overallScore":0,"dimensions":[{"name":"...","score":0,"rationale":"...","suggestions":["..."]}],"compliant":true,"blockingIssues":["..."],"summary":"..."}`;

  const constraintsBlock = state.constraints
    .map((c) => `- id=${c.id} severity=${c.severity} [${c.earsPattern}] ${c.earsText}`)
    .join("\n");
  const testsBlock = state.testCases
    .map(
      (t) =>
        `- ${t.name} (constraint ${t.constraintId}): ${
          t.passed === null ? "not run" : t.passed ? "passed" : `failed (${t.errorMessage ?? "unknown error"})`
        }`
    )
    .join("\n");

  const raw = await provider.complete({
    system,
    user: `Generated code summary:\n${state.generatedCode ?? "(none)"}\n\nConstraints:\n${constraintsBlock}\n\nTest results:\n${testsBlock}`,
  });

  const parsed = parseJsonResponse(raw, ScoreResponseSchema, "scoreQuality");

  const qualityReport: QualityReport = {
    overallScore: parsed.overallScore,
    dimensions: parsed.dimensions,
    compliant: parsed.compliant,
    blockingIssues: parsed.blockingIssues,
    summary: parsed.summary,
  };

  return {
    ...state,
    qualityReport,
  };
}
