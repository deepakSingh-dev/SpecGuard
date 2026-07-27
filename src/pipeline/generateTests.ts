import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PipelineState, TestCase } from "../models";
import type { PipelineContext } from "./context";
import { parseJsonResponse } from "./jsonResponse";

const GeneratedTestSchema = z.object({
  id: z.string().optional(),
  constraintId: z.string(),
  name: z.string(),
  description: z.string(),
  testCode: z.string(),
  expectedOutcome: z.string(),
});

const GenerationResponseSchema = z.object({
  testCases: z.array(GeneratedTestSchema),
});

function resolveFramework(setting: "auto" | "vitest" | "pytest"): "vitest" | "pytest" {
  return setting === "auto" ? "vitest" : setting;
}

export async function generateTests(
  state: PipelineState,
  ctx: PipelineContext
): Promise<PipelineState> {
  const provider = ctx.registry.resolve(ctx.settings.providers.testGeneration);
  if (!provider.complete) {
    throw new Error(`generateTests: provider "${provider.id}" does not implement complete().`);
  }

  const framework = resolveFramework(ctx.settings.testFramework);

  const system = `You are a test engineer. Write exactly one automated test per constraint, targeting the
${framework} framework, that fails until the constraint is satisfied. Respond with ONLY a JSON object of
this shape, no prose, no markdown fence:
{"testCases":[{"constraintId":"...","name":"...","description":"...","testCode":"...","expectedOutcome":"..."}]}`;

  const constraintsBlock = state.constraints
    .map((c) => `- id=${c.id} [${c.earsPattern}] ${c.earsText}`)
    .join("\n");

  const raw = await provider.complete({
    system,
    user: `Constraints:\n${constraintsBlock}`,
  });

  const parsed = parseJsonResponse(raw, GenerationResponseSchema, "generateTests");

  const testCases: TestCase[] = parsed.testCases.map((t, index) => ({
    id: t.id ?? `test-${index + 1}-${randomUUID().slice(0, 8)}`,
    constraintId: t.constraintId,
    name: t.name,
    description: t.description,
    testCode: t.testCode,
    expectedOutcome: t.expectedOutcome,
    passed: null,
    errorMessage: null,
    executionTimeMs: null,
  }));

  return {
    ...state,
    testCases,
  };
}
