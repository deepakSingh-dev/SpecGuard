import type { ProviderRegistry } from "../providers/registry";

export interface PipelineSettings {
  providers: {
    constraintExtraction: string;
    codeGeneration: string;
    testGeneration: string;
    scoring: string;
  };
  gate: {
    minScore: number;
  };
  testFramework: "auto" | "vitest" | "pytest";
}

/**
 * Passed to every pipeline stage. Stages resolve providers from `registry`
 * using the ids in `settings.providers` — they never construct a provider
 * directly.
 */
export interface PipelineContext {
  registry: ProviderRegistry;
  settings: PipelineSettings;
}
