import * as vscode from "vscode";

export type PhaseId =
  | "extract"
  | "approve"
  | "generateCode"
  | "generateTests"
  | "runTests"
  | "score"
  | "gate";

export type PhaseStatus = "pending" | "active" | "done" | "failed";

interface PhaseDefinition {
  id: PhaseId;
  label: string;
}

const PHASES: PhaseDefinition[] = [
  { id: "extract", label: "Extract Constraints" },
  { id: "approve", label: "Review & Approve" },
  { id: "generateCode", label: "Generate Code" },
  { id: "generateTests", label: "Generate Tests" },
  { id: "runTests", label: "Run Tests" },
  { id: "score", label: "Score Quality" },
  { id: "gate", label: "Quality Gate" },
];

class PhaseTreeItem extends vscode.TreeItem {
  constructor(def: PhaseDefinition, status: PhaseStatus) {
    super(def.label, vscode.TreeItemCollapsibleState.None);
    this.description = status;
    this.iconPath = iconFor(status);
    this.contextValue = `specguard.phase.${status}`;
  }
}

function iconFor(status: PhaseStatus): vscode.ThemeIcon {
  switch (status) {
    case "done":
      return new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
    case "failed":
      return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
    case "active":
      return new vscode.ThemeIcon("sync~spin");
    case "pending":
    default:
      return new vscode.ThemeIcon("circle-large-outline");
  }
}

/** Sidebar tree showing each pipeline phase with a live status, driven by the orchestrator's onStatusChange hook. */
export class PipelineTreeProvider implements vscode.TreeDataProvider<PhaseTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private statuses = new Map<PhaseId, PhaseStatus>(PHASES.map((p) => [p.id, "pending"]));

  reset(): void {
    for (const phase of PHASES) {
      this.statuses.set(phase.id, "pending");
    }
    this._onDidChangeTreeData.fire();
  }

  setStatus(id: PhaseId, status: PhaseStatus): void {
    this.statuses.set(id, status);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PhaseTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): PhaseTreeItem[] {
    return PHASES.map((def) => new PhaseTreeItem(def, this.statuses.get(def.id) ?? "pending"));
  }
}
