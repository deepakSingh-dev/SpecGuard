import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  CompleteRequest,
  DelegateTaskRequest,
  DelegateTaskResult,
  Provider,
} from "./provider";

export interface ClaudeAgentProviderConfig {
  id?: string;
  model?: string;
}

/**
 * Backed by the Claude Agent SDK in headless/programmatic mode. `delegateTask`
 * runs the SDK with `cwd` pinned to the given worktree so the agent's file
 * writes land there, never in the real workspace.
 */
export class ClaudeAgentProvider implements Provider {
  id: string;
  kind: "agent" = "agent";
  capabilities = { canGenerateCode: true, canReason: true, streaming: true };

  private model?: string;

  constructor(config: ClaudeAgentProviderConfig = {}) {
    this.id = config.id ?? "claude-agent-sdk";
    this.model = config.model ?? process.env.SPECGUARD_CLAUDE_MODEL;
  }

  private assertConfigured(): void {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error(
        "ClaudeAgentProvider is not configured: set ANTHROPIC_API_KEY or " +
          "CLAUDE_CODE_OAUTH_TOKEN (or otherwise authenticate the Claude CLI) " +
          "before running SpecGuard with this provider."
      );
    }
  }

  async delegateTask(req: DelegateTaskRequest): Promise<DelegateTaskResult> {
    this.assertConfigured();

    const constraintsBlock = req.constraints
      .map((c) => `- [${c.earsPattern}] ${c.earsText} (severity ${c.severity})`)
      .join("\n");
    const prompt = `${req.prompt}\n\nConstraints to satisfy:\n${constraintsBlock}`;

    const filesWritten = new Set<string>();
    let summary = "";

    const stream = query({
      prompt,
      options: {
        cwd: req.worktreePath,
        model: this.model,
        permissionMode: "acceptEdits",
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      },
    });

    for await (const message of stream) {
      if (message.type === "assistant") {
        const content = message.message.content;
        for (const block of content) {
          if (block.type === "tool_use" && (block.name === "Write" || block.name === "Edit")) {
            const input = block.input as { file_path?: string };
            if (input?.file_path) {
              filesWritten.add(input.file_path);
            }
          }
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          summary = message.result;
        } else {
          throw new Error(`ClaudeAgentProvider delegateTask failed: ${message.subtype}`);
        }
      }
    }

    return { filesWritten: [...filesWritten], summary };
  }

  async complete(req: CompleteRequest): Promise<string> {
    this.assertConfigured();

    let result = "";
    const stream = query({
      prompt: req.user,
      options: {
        model: this.model,
        systemPrompt: req.system,
        permissionMode: "bypassPermissions",
        allowedTools: [],
        maxTurns: 1,
      },
    });

    for await (const message of stream) {
      if (message.type === "result") {
        if (message.subtype === "success") {
          result = message.result;
        } else {
          throw new Error(`ClaudeAgentProvider complete failed: ${message.subtype}`);
        }
      }
    }

    return result;
  }
}
