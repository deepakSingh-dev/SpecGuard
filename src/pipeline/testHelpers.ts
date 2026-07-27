import type { PipelineState } from "../models";
import type { PipelineContext, PipelineSettings } from "./context";
import { ProviderRegistry } from "../providers/registry";

export function createBaseState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    specId: "spec-1",
    specRequest: {
      title: "Login flow",
      description: "Users can log in with email and password.",
      naturalLanguageSpec: "When a user submits valid credentials, they are logged in.",
      targetLanguage: "auto",
      context: {},
    },
    status: "pending",
    constraints: [],
    testCases: [],
    generatedCode: null,
    qualityReport: null,
    error: null,
    retryCount: 0,
    maxRetries: 2,
    worktreePath: null,
    ...overrides,
  };
}

export function createContext(
  registry: ProviderRegistry,
  providerId: string,
  settingsOverrides: Partial<PipelineSettings> = {}
): PipelineContext {
  return {
    registry,
    settings: {
      providers: {
        constraintExtraction: providerId,
        codeGeneration: providerId,
        testGeneration: providerId,
        scoring: providerId,
      },
      gate: { minScore: 75 },
      testFramework: "auto",
      ...settingsOverrides,
    },
  };
}
