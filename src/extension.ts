import * as vscode from "vscode";
import { SpecRequest, type PipelineState } from "./models";
import type { PipelineContext } from "./pipeline/context";
import { runPipeline } from "./pipeline/orchestrator";
import { createDefaultRegistry } from "./providers/registry";
import { reviewConstraints } from "./ui/constraintReview";
import { showScoreDashboard } from "./ui/scoreDashboard";
import { PipelineTreeProvider } from "./ui/treeView";

export function activate(context: vscode.ExtensionContext) {
  const treeProvider = new PipelineTreeProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider("specguard.pipeline", treeProvider));

  const runCommand = vscode.commands.registerCommand("specguard.run", () =>
    runSpecGuardPipeline(treeProvider)
  );
  context.subscriptions.push(runCommand);
}

export function deactivate() {}

async function runSpecGuardPipeline(treeProvider: PipelineTreeProvider): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("SpecGuard: open a folder or workspace first.");
    return;
  }

  const title = await vscode.window.showInputBox({
    title: "SpecGuard: Spec Title",
    prompt: "A short title for this spec (3-200 characters)",
    validateInput: (v) => (v.trim().length < 3 ? "Title must be at least 3 characters." : undefined),
  });
  if (!title) return;

  const description = await vscode.window.showInputBox({
    title: "SpecGuard: Description",
    prompt: "A one-line description (at least 10 characters)",
    validateInput: (v) => (v.trim().length < 10 ? "Description must be at least 10 characters." : undefined),
  });
  if (!description) return;

  const naturalLanguageSpec = await vscode.window.showInputBox({
    title: "SpecGuard: Specification",
    prompt: "Describe the desired behavior in plain English (at least 20 characters)",
    validateInput: (v) => (v.trim().length < 20 ? "Specification must be at least 20 characters." : undefined),
  });
  if (!naturalLanguageSpec) return;

  const parsed = SpecRequest.safeParse({ title, description, naturalLanguageSpec });
  if (!parsed.success) {
    vscode.window.showErrorMessage(`SpecGuard: invalid spec — ${parsed.error.message}`);
    return;
  }

  const config = vscode.workspace.getConfiguration("specguard");
  const minScore = config.get<number>("gate.minScore", 75);
  const ctx: PipelineContext = {
    registry: createDefaultRegistry(),
    settings: {
      providers: {
        constraintExtraction: config.get<string>("providers.constraintExtraction", "fake"),
        codeGeneration: config.get<string>("providers.codeGeneration", "fake"),
        testGeneration: config.get<string>("providers.testGeneration", "fake"),
        scoring: config.get<string>("providers.scoring", "fake"),
      },
      gate: { minScore },
      testFramework: config.get<"auto" | "vitest" | "pytest">("testFramework", "auto"),
    },
  };

  treeProvider.reset();
  treeProvider.setStatus("extract", "active");

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "SpecGuard: running pipeline", cancellable: false },
    async (progress) => {
      const result = await runPipeline(parsed.data, ctx, {
        repoRoot: workspaceFolder.uri.fsPath,
        onConstraintApproval: async (state) => {
          treeProvider.setStatus("extract", "done");
          treeProvider.setStatus("approve", "active");
          progress.report({ message: "Awaiting constraint approval…" });
          const constraints = await reviewConstraints(state);
          treeProvider.setStatus("approve", "done");
          return { ...state, constraints };
        },
        onStatusChange: (state) => reportStatus(treeProvider, progress, state),
      });

      finalizeTreeStatus(treeProvider, result);
      showScoreDashboard(result, minScore);

      if (result.status === "complete") {
        vscode.window.showInformationMessage(
          `SpecGuard: pipeline complete (score ${result.qualityReport?.overallScore ?? "n/a"}/100).`
        );
      } else {
        vscode.window.showErrorMessage(`SpecGuard: pipeline failed — ${result.error ?? "unknown error"}`);
      }
    }
  );
}

function reportStatus(
  treeProvider: PipelineTreeProvider,
  progress: vscode.Progress<{ message?: string }>,
  state: PipelineState
): void {
  switch (state.status) {
    case "generating_tests":
      treeProvider.setStatus("generateCode", "active");
      progress.report({ message: "Generating code and tests…" });
      break;
    case "running_tests":
      treeProvider.setStatus("generateCode", "done");
      treeProvider.setStatus("generateTests", "done");
      treeProvider.setStatus("runTests", "active");
      progress.report({ message: "Running tests…" });
      break;
    case "scoring":
      treeProvider.setStatus("runTests", "done");
      treeProvider.setStatus("score", "active");
      progress.report({ message: "Scoring quality…" });
      break;
    default:
      break;
  }
}

function finalizeTreeStatus(treeProvider: PipelineTreeProvider, state: PipelineState): void {
  treeProvider.setStatus("score", "done");
  treeProvider.setStatus("gate", state.status === "complete" ? "done" : "failed");
}
