import * as vscode from "vscode";
import type { PipelineSettings } from "./pipeline/context";

export interface ClaudeAgentSdkSettings {
  /** Model name/alias passed to the Claude Agent SDK. Empty means "let the SDK pick its default". */
  model?: string;
}

export interface SpecGuardSettings extends PipelineSettings {
  /** When true, block a run whose scoring provider is the same as its code-generation provider. */
  enforceDifferentScoringProvider: boolean;
  claudeAgentSdk: ClaudeAgentSdkSettings;
}

/** Single source of truth for reading `specguard.*` VSCode settings. */
export function loadSettings(): SpecGuardSettings {
  const config = vscode.workspace.getConfiguration("specguard");

  return {
    providers: {
      constraintExtraction: config.get<string>("providers.constraintExtraction", "fake"),
      codeGeneration: config.get<string>("providers.codeGeneration", "fake"),
      testGeneration: config.get<string>("providers.testGeneration", "fake"),
      scoring: config.get<string>("providers.scoring", "fake"),
    },
    gate: { minScore: config.get<number>("gate.minScore", 75) },
    testFramework: config.get<"auto" | "vitest" | "pytest">("testFramework", "auto"),
    enforceDifferentScoringProvider: config.get<boolean>("scoring.enforceDifferentProvider", false),
    claudeAgentSdk: {
      model: config.get<string>("claudeAgentSdk.model", "") || undefined,
    },
  };
}

/**
 * Returns a warning message when the scoring provider matches the
 * code-generation provider and `enforceDifferentProvider` is on — the whole
 * point of a separate scoring provider is an independent check.
 */
export function scoringProviderWarning(settings: SpecGuardSettings): string | null {
  if (
    settings.enforceDifferentScoringProvider &&
    settings.providers.scoring === settings.providers.codeGeneration
  ) {
    return `Scoring provider ("${settings.providers.scoring}") is the same as the code-generation provider. specguard.scoring.enforceDifferentProvider is enabled, so scoring would not be an independent check.`;
  }
  return null;
}
