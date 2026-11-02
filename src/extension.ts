import * as vscode from 'vscode';
import { getConfiguration, setApiKey } from './config/configuration';
import { createProviderClient } from './model/providerClients';
import { PairOrchestrator } from './orchestrator/pairOrchestrator';
import { PairFlowPanel } from './ui/PairFlowPanel';
import { PairDiffProvider } from './ui/PairDiffProvider';
import { WorkspaceAdapter } from './workspace/workspaceAdapter';

export function activate(context: vscode.ExtensionContext): void {
  const diffProvider = new PairDiffProvider();
  let panel: PairFlowPanel;
  const createSession = async (): Promise<PairOrchestrator | undefined> => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) { void vscode.window.showErrorMessage('Open a workspace before starting Pair Flow.'); return undefined; }
    const settings = await getConfiguration(context.secrets);
    if (settings.provider !== 'ollama' && !settings.apiKey) {
      await setApiKey(context.secrets);
      settings.apiKey = (await getConfiguration(context.secrets)).apiKey;
      if (!settings.apiKey) return undefined;
    }
    return new PairOrchestrator(createProviderClient(settings), new WorkspaceAdapter(root), state => panel.render(state));
  };
  panel = new PairFlowPanel(context.extensionUri, diffProvider, createSession);
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('pairflow-diff', diffProvider));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('pairFlow.view', panel, { webviewOptions: { retainContextWhenHidden: true } }));
  context.subscriptions.push(vscode.commands.registerCommand('pairFlow.setApiKey', () => setApiKey(context.secrets)));
  context.subscriptions.push(vscode.commands.registerCommand('pairFlow.start', async () => {
    await panel.ensureSession();
    await vscode.commands.executeCommand('workbench.view.extension.pairFlow');
  }));
}
export function deactivate(): void {}
