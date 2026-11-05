import * as vscode from 'vscode';
import { chooseModel, getConfiguration, setApiKey } from './config/configuration';
import { createProviderClient } from './model/providerClients';
import { ReloadingModelClient } from './model/reloadingModelClient';
import { PairOrchestrator } from './orchestrator/pairOrchestrator';
import { PairFlowPanel } from './ui/PairFlowPanel';
import { PairDiffProvider } from './ui/PairDiffProvider';
import { WorkspaceAdapter } from './workspace/workspaceAdapter';
import { SessionRepository } from './session/sessionRepository';
import { VscodeSessionFileStore } from './session/vscodeSessionStorage';
import type { PersistedSession } from './session/types';

export function activate(context: vscode.ExtensionContext): void {
  const diffProvider = new PairDiffProvider();
  let panel: PairFlowPanel;
  const repository = context.storageUri ? new SessionRepository(context.workspaceState, new VscodeSessionFileStore(context.storageUri)) : undefined;
  const makeOrchestrator = async (initial?: PersistedSession, promptForKey = false): Promise<PairOrchestrator | undefined> => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) { void vscode.window.showErrorMessage('Open a workspace before starting Pair Flow.'); return undefined; }
    const settings = await getConfiguration(context.secrets);
    if (promptForKey && settings.provider !== 'ollama' && !settings.apiKey) {
      await setApiKey(context.secrets);
      Object.assign(settings, await getConfiguration(context.secrets)); // picks up the key and the base URL chosen in the prompt
      if (!settings.apiKey) return undefined;
    }
    // Settings are read again for every request, so a model picked mid-session applies on Retry or Resume.
    const model = new ReloadingModelClient(async () => createProviderClient(await getConfiguration(context.secrets)));
    const orchestrator = new PairOrchestrator(model, new WorkspaceAdapter(root, settings.maxContextFiles), state => panel.render(state), {
      initial,
      persist: async session => { await repository?.save(session); }
    });
    await orchestrator.restorePrepared();
    return orchestrator;
  };
  const createSession = async (): Promise<PairOrchestrator | undefined> => {
    return makeOrchestrator(undefined, true);
  };
  const restoreSession = async (id?: string): Promise<PairOrchestrator | undefined> => {
    const initial = id ? await repository?.load(id) : await repository?.loadActive();
    return initial ? makeOrchestrator(initial) : undefined;
  };
  const timeoutSeconds = Math.max(30, Math.min(600, vscode.workspace.getConfiguration('pairFlow').get<number>('requestTimeoutSeconds', 120)));
  panel = new PairFlowPanel(context.extensionUri, diffProvider, createSession, restoreSession, () => repository?.list() ?? [], timeoutSeconds, {
    chooseModel: () => chooseModel(context.secrets),
    discard: async id => { await repository?.markStatus(id, 'canceled'); }
  });
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('pairflow-diff', diffProvider));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('pairFlow.view', panel, { webviewOptions: { retainContextWhenHidden: true } }));
  context.subscriptions.push(vscode.commands.registerCommand('pairFlow.setApiKey', () => setApiKey(context.secrets)));
  context.subscriptions.push(vscode.commands.registerCommand('pairFlow.chooseModel', () => chooseModel(context.secrets)));
  context.subscriptions.push(vscode.commands.registerCommand('pairFlow.start', async () => {
    await panel.ensureSession();
    await vscode.commands.executeCommand('workbench.view.extension.pairFlow');
  }));
}
export function deactivate(): void {}
