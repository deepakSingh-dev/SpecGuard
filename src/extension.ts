import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const runCommand = vscode.commands.registerCommand("specguard.run", () => {
    vscode.window.showInformationMessage("SpecGuard is alive");
  });

  context.subscriptions.push(runCommand);
}

export function deactivate() {}
