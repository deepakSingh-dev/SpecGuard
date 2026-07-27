import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ConstraintType, EarsPattern, type Constraint, type PipelineState } from "../models";
import type { PipelineContext } from "./context";
import { parseJsonResponse } from "./jsonResponse";

const ExtractedConstraintSchema = z.object({
  id: z.string().optional(),
  type: ConstraintType,
  earsPattern: EarsPattern,
  earsText: z.string(),
  description: z.string(),
  required: z.boolean().default(true),
  severity: z.number().int().min(1).max(10),
});

const ExtractionResponseSchema = z.object({
  constraints: z.array(ExtractedConstraintSchema),
});

const SYSTEM_PROMPT = `You are a requirements analyst. Extract discrete, testable constraints from a
natural-language software specification. Classify each constraint into exactly one of the five EARS
(Easy Approach to Requirements Syntax) patterns and format its text accordingly:

- ubiquitous: "The system shall <response>."
- event_driven: "When <trigger>, the system shall <response>."
- state_driven: "While <state>, the system shall <response>."
- unwanted: "If <condition>, then the system shall <response>."
- optional: "Where <feature>, the system shall <response>."

Respond with ONLY a JSON object of this shape, no prose, no markdown fence:
{"constraints":[{"type":"functional|performance|security|type_safety|edge_case","earsPattern":"ubiquitous|event_driven|state_driven|unwanted|optional","earsText":"...","description":"...","required":true,"severity":1}]}`;

export async function extractConstraints(
  state: PipelineState,
  ctx: PipelineContext
): Promise<PipelineState> {
  const provider = ctx.registry.resolve(ctx.settings.providers.constraintExtraction);
  if (!provider.complete) {
    throw new Error(
      `extractConstraints: provider "${provider.id}" does not implement complete().`
    );
  }

  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    user: `Title: ${state.specRequest.title}\n\nDescription: ${state.specRequest.description}\n\nSpecification:\n${state.specRequest.naturalLanguageSpec}`,
  });

  const parsed = parseJsonResponse(raw, ExtractionResponseSchema, "extractConstraints");

  const constraints: Constraint[] = parsed.constraints.map((c, index) => ({
    id: c.id ?? `constraint-${index + 1}-${randomUUID().slice(0, 8)}`,
    type: c.type,
    earsPattern: c.earsPattern,
    earsText: c.earsText,
    description: c.description,
    required: c.required,
    severity: c.severity,
  }));

  return {
    ...state,
    constraints,
  };
}
