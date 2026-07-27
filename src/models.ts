import { z } from "zod";

export const SpecStatus = z.enum([
  "pending",
  "validating",
  "generating_tests",
  "running_tests",
  "scoring",
  "complete",
  "failed",
]);
export type SpecStatus = z.infer<typeof SpecStatus>;

export const ConstraintType = z.enum([
  "functional",
  "performance",
  "security",
  "type_safety",
  "edge_case",
]);
export type ConstraintType = z.infer<typeof ConstraintType>;

export const EarsPattern = z.enum([
  "ubiquitous",
  "event_driven",
  "state_driven",
  "unwanted",
  "optional",
]);
export type EarsPattern = z.infer<typeof EarsPattern>;

export const Constraint = z.object({
  id: z.string(),
  type: ConstraintType,
  earsPattern: EarsPattern,
  earsText: z.string(),
  description: z.string(),
  required: z.boolean(),
  severity: z.number().int().min(1).max(10),
});
export type Constraint = z.infer<typeof Constraint>;

export const TestCase = z.object({
  id: z.string(),
  constraintId: z.string(),
  name: z.string(),
  description: z.string(),
  testCode: z.string(),
  expectedOutcome: z.string(),
  passed: z.boolean().nullable(),
  errorMessage: z.string().nullable(),
  executionTimeMs: z.number().nullable(),
});
export type TestCase = z.infer<typeof TestCase>;

export const QualityDimension = z.object({
  name: z.string(),
  score: z.number().min(0).max(100),
  rationale: z.string(),
  suggestions: z.array(z.string()),
});
export type QualityDimension = z.infer<typeof QualityDimension>;

export const QualityReport = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(QualityDimension),
  compliant: z.boolean(),
  blockingIssues: z.array(z.string()),
  summary: z.string(),
});
export type QualityReport = z.infer<typeof QualityReport>;

export const SpecRequest = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  naturalLanguageSpec: z.string().min(20),
  targetLanguage: z.string().default("auto"),
  context: z.record(z.string(), z.unknown()).default({}),
});
export type SpecRequest = z.infer<typeof SpecRequest>;

export const PipelineState = z.object({
  specId: z.string(),
  specRequest: SpecRequest,
  status: SpecStatus,
  constraints: z.array(Constraint),
  testCases: z.array(TestCase),
  generatedCode: z.string().nullable(),
  qualityReport: QualityReport.nullable(),
  error: z.string().nullable(),
  retryCount: z.number().int().default(0),
  maxRetries: z.number().int().default(2),
  worktreePath: z.string().nullable(),
});
export type PipelineState = z.infer<typeof PipelineState>;
