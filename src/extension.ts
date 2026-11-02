import * as vscode from 'vscode';
import { getConfiguration, setApiKey } from './config/configuration';
import { createProviderClient } from './model/providerClients';
import { PairOrchestrator } from './orchestrator/pairOrchestrator';
import { PairFlowPanel } from './ui/PairFlowPanel';
import { WorkspaceAdapter } from './workspace/workspaceAdapter';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('pairFlow.setApiKey', () => setApiKey(context.secrets)));
  context.subscriptions.push(vscode.commands.registerCommand('pairFlow.start', async () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) { void vscode.window.showErrorMessage('Open a workspace before starting Pair Flow.'); return; }
    const settings = await getConfiguration(context.secrets);
    if (settings.provider !== 'ollama' && !settings.apiKey) { await setApiKey(context.secrets); settings.apiKey = (await getConfiguration(context.secrets)).apiKey; if (!settings.apiKey) return; }
    const panel = PairFlowPanel.create(context.extensionUri);
    const flow = new PairOrchestrator(createProviderClient(settings), new WorkspaceAdapter(root), state => panel.render(state));
    panel.bind(flow);
  }));
}
export function deactivate(): void {}
