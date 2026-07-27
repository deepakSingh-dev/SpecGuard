import type {
  CompleteRequest,
  DelegateTaskRequest,
  DelegateTaskResult,
  Provider,
} from "./provider";

export interface FakeProviderConfig {
  id?: string;
  completeResponse?: string;
  delegateTaskResult?: DelegateTaskResult;
}

/**
 * Deterministic, canned Provider used by every test in this codebase so
 * nothing ever hits a real model.
 */
export class FakeProvider implements Provider {
  id: string;
  kind: "agent" | "model" = "model";
  capabilities = { canGenerateCode: true, canReason: true, streaming: false };

  private completeResponse: string;
  private delegateTaskResult: DelegateTaskResult;

  constructor(config: FakeProviderConfig = {}) {
    this.id = config.id ?? "fake";
    this.completeResponse = config.completeResponse ?? "{}";
    this.delegateTaskResult = config.delegateTaskResult ?? {
      filesWritten: ["fake-generated-file.ts"],
      summary: "Fake provider generated a canned file.",
    };
  }

  async complete(_req: CompleteRequest): Promise<string> {
    return this.completeResponse;
  }

  async delegateTask(_req: DelegateTaskRequest): Promise<DelegateTaskResult> {
    return this.delegateTaskResult;
  }
}
