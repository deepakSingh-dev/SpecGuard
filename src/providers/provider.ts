import type { Constraint } from "../models";

export interface ProviderCapabilities {
  canGenerateCode: boolean;
  canReason: boolean;
  streaming: boolean;
}

export interface CompleteRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface DelegateTaskRequest {
  prompt: string;
  worktreePath: string;
  constraints: Constraint[];
}

export interface DelegateTaskResult {
  filesWritten: string[];
  summary: string;
}

/**
 * Every AI call in SpecGuard goes through this interface. The rest of the
 * codebase never talks to a model or agent SDK directly.
 */
export interface Provider {
  id: string;
  kind: "agent" | "model";
  capabilities: ProviderCapabilities;

  /** Mode B: structured text in, text out. Used for reasoning stages. */
  complete?(req: CompleteRequest): Promise<string>;

  /** Mode A: hand a task to an autonomous coding agent scoped to a worktree. */
  delegateTask?(req: DelegateTaskRequest): Promise<DelegateTaskResult>;
}
