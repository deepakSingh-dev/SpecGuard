import * as vscode from "vscode";
import type { Constraint, PipelineState } from "../models";

const EARS_LABELS: Record<Constraint["earsPattern"], string> = {
  ubiquitous: "Ubiquitous",
  event_driven: "Event-driven",
  state_driven: "State-driven",
  unwanted: "Unwanted",
  optional: "Optional",
};

/**
 * Blocks until the user approves (optionally after editing) the extracted
 * constraints. Wired as the orchestrator's onConstraintApproval hook.
 */
export async function reviewConstraints(state: PipelineState): Promise<Constraint[]> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "specguard.constraintReview",
      "SpecGuard: Review Constraints",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false }
    );

    let settled = false;
    const settle = (constraints: Constraint[]) => {
      if (settled) return;
      settled = true;
      resolve(constraints);
    };

    const nonce = getNonce();
    panel.webview.html = renderHtml(panel.webview, nonce, state.constraints);

    panel.webview.onDidReceiveMessage((message: { type?: string; constraints?: Constraint[] }) => {
      if (message?.type === "approve") {
        settle(message.constraints ?? state.constraints);
        panel.dispose();
      }
    });

    panel.onDidDispose(() => {
      // Closed without clicking Approve — fall back to the constraints as
      // extracted so the pipeline never hangs waiting forever.
      settle(state.constraints);
    });
  });
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderConstraintCard(c: Constraint, index: number): string {
  return `
    <div class="card" data-index="${index}">
      <div class="card-header">
        <span class="badge pattern">${EARS_LABELS[c.earsPattern]}</span>
        <span class="badge type">${escapeHtml(c.type)}</span>
        <label class="severity">
          Severity
          <input type="number" min="1" max="10" value="${c.severity}" data-field="severity" data-index="${index}" />
        </label>
      </div>
      <textarea data-field="earsText" data-index="${index}" rows="2">${escapeHtml(c.earsText)}</textarea>
      <textarea class="description" data-field="description" data-index="${index}" rows="2">${escapeHtml(c.description)}</textarea>
      <label class="required">
        <input type="checkbox" data-field="required" data-index="${index}" ${c.required ? "checked" : ""} />
        Required
      </label>
    </div>`;
}

function renderHtml(webview: vscode.Webview, nonce: string, constraints: Constraint[]): string {
  const cards = constraints.map(renderConstraintCard).join("\n");
  const serialized = JSON.stringify(constraints).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>Review Constraints</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 1rem 1.5rem; }
    h1 { font-size: 1.2rem; }
    .subtitle { opacity: 0.75; margin-bottom: 1rem; }
    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
      background: var(--vscode-editor-background);
    }
    .card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .badge {
      font-size: 0.75rem;
      padding: 0.1rem 0.5rem;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .severity { margin-left: auto; display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
    .severity input { width: 3rem; }
    textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 0.4rem;
      font-family: var(--vscode-font-family);
      margin-bottom: 0.4rem;
      resize: vertical;
    }
    textarea.description { opacity: 0.85; font-size: 0.9rem; }
    .required { font-size: 0.85rem; display: flex; align-items: center; gap: 0.3rem; }
    .actions { position: sticky; bottom: 0; padding-top: 0.75rem; background: var(--vscode-editor-background); }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 0.5rem 1.2rem;
      cursor: pointer;
      font-size: 0.9rem;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <h1>Review Extracted Constraints</h1>
  <p class="subtitle">Edit severity, wording, or description as needed, then approve to continue.</p>
  <div id="cards">${cards}</div>
  <div class="actions">
    <button id="approve">Approve &amp; Continue</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const original = ${serialized};

    document.getElementById("approve").addEventListener("click", () => {
      const constraints = original.map((c, index) => {
        const card = document.querySelector('[data-index="' + index + '"].card');
        const earsText = card.querySelector('[data-field="earsText"]').value;
        const description = card.querySelector('[data-field="description"]').value;
        const severity = Number(card.querySelector('[data-field="severity"]').value);
        const required = card.querySelector('[data-field="required"]').checked;
        return { ...c, earsText, description, severity, required };
      });
      vscode.postMessage({ type: "approve", constraints });
    });
  </script>
</body>
</html>`;
}
