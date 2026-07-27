import * as vscode from "vscode";
import type { PipelineState, QualityDimension } from "../models";
import { applyGate } from "../pipeline/gate";

/** Renders the six-dimension quality breakdown and the gate verdict for a finished pipeline run. */
export function showScoreDashboard(state: PipelineState, minScore: number): void {
  const panel = vscode.window.createWebviewPanel(
    "specguard.scoreDashboard",
    "SpecGuard: Score Dashboard",
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  panel.webview.html = renderHtml(panel.webview, state, minScore);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDimensionBar(dim: QualityDimension): string {
  const pct = Math.max(0, Math.min(100, dim.score));
  const color = pct >= 75 ? "var(--vscode-charts-green)" : pct >= 50 ? "var(--vscode-charts-yellow)" : "var(--vscode-charts-red)";
  const suggestions = dim.suggestions.length
    ? `<ul>${dim.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";

  return `
    <div class="dimension">
      <div class="dimension-header">
        <span class="dimension-name">${escapeHtml(dim.name)}</span>
        <span class="dimension-score">${dim.score}/100</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>
      <p class="rationale">${escapeHtml(dim.rationale)}</p>
      ${suggestions}
    </div>`;
}

function renderHtml(webview: vscode.Webview, state: PipelineState, minScore: number): string {
  const report = state.qualityReport;

  const body = report
    ? renderReportBody(state, report, minScore)
    : `<p class="empty">No quality report is available${state.error ? `: ${escapeHtml(state.error)}` : "."}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';" />
  <title>Score Dashboard</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 1rem 1.5rem; }
    h1 { font-size: 1.2rem; }
    .verdict {
      display: inline-block;
      padding: 0.3rem 0.9rem;
      border-radius: 12px;
      font-weight: 600;
      margin: 0.5rem 0 1rem;
    }
    .verdict.pass { background: var(--vscode-charts-green); color: black; }
    .verdict.fail { background: var(--vscode-charts-red); color: white; }
    .overall { font-size: 2rem; font-weight: 700; }
    .overall-label { opacity: 0.7; font-size: 0.85rem; }
    .dimension { margin: 1rem 0; }
    .dimension-header { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 0.25rem; }
    .bar-track { height: 8px; border-radius: 4px; background: var(--vscode-panel-border); overflow: hidden; }
    .bar-fill { height: 100%; }
    .rationale { margin: 0.35rem 0; opacity: 0.85; font-size: 0.9rem; }
    ul { margin: 0.25rem 0 0.25rem 1.2rem; font-size: 0.85rem; opacity: 0.85; }
    .reasons { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 6px; background: var(--vscode-inputValidation-errorBackground, transparent); }
    .empty { opacity: 0.7; }
  </style>
</head>
<body>
  <h1>Quality Score</h1>
  ${body}
</body>
</html>`;
}

function renderReportBody(
  state: PipelineState,
  report: NonNullable<PipelineState["qualityReport"]>,
  minScore: number
): string {
  const gateResult = applyGate(report, minScore, state.constraints, state.testCases);
  const verdictClass = gateResult.passed ? "pass" : "fail";
  const verdictText = gateResult.passed ? "Gate passed" : "Gate failed";

  const reasons = gateResult.reasons.length
    ? `<div class="reasons"><strong>Blocking reasons:</strong><ul>${gateResult.reasons
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join("")}</ul></div>`
    : "";

  return `
    <div class="overall">${report.overallScore}<span style="font-size:1rem;">/100</span></div>
    <div class="overall-label">Overall score (gate threshold: ${minScore})</div>
    <div class="verdict ${verdictClass}">${verdictText}</div>
    <p>${escapeHtml(report.summary)}</p>
    ${report.dimensions.map(renderDimensionBar).join("\n")}
    ${reasons}`;
}
