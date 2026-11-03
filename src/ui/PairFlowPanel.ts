import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { PairOrchestrator } from '../orchestrator/pairOrchestrator';
import { initialState } from '../session/sessionMachine';
import type { Chunk, SessionState } from '../session/types';
import type { SessionSummary } from '../session/types';
import { moveFileSelection } from './fileNavigation';
import { PairDiffProvider } from './PairDiffProvider';
import { parsePanelMessage } from './panelMessages';
import { renderBody, renderWebviewHtml } from './webviewHtml';

export class PairFlowPanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private orchestrator?: PairOrchestrator;
  private state: SessionState = initialState();
  private selectedFile = 0;
  private lastChunk?: Chunk;
  private restorePromise?: Promise<void>;
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffs: PairDiffProvider,
    private readonly createSession: () => Promise<PairOrchestrator | undefined>,
    private readonly restoreSession: () => Promise<PairOrchestrator | undefined> = async () => undefined,
    private readonly listSessions: () => readonly SessionSummary[] = () => [],
    private readonly timeoutSeconds = 120
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
    view.webview.onDidReceiveMessage(value => void this.handle(value));
    this.draw();
    void this.ensureRestored();
  }
  bind(orchestrator: PairOrchestrator): void { this.orchestrator = orchestrator; this.render(orchestrator.current); }
  async ensureSession(): Promise<PairOrchestrator | undefined> {
    await this.ensureRestored();
    if (this.orchestrator) return this.orchestrator;
    const orchestrator = await this.createSession();
    if (orchestrator) this.bind(orchestrator);
    return orchestrator;
  }
  render(state: SessionState): void {
    this.state = state;
    if (state.chunk && state.chunk !== this.lastChunk) {
      this.lastChunk = state.chunk;
      this.selectedFile = 0;
      this.draw();
      void this.openSelected();
      return;
    }
    if (!state.chunk) this.lastChunk = undefined;
    this.draw();
  }
  private draw(): void {
    if (!this.view) return;
    const webview = this.view.webview;
    const nonce = randomBytes(16).toString('base64');
    webview.html = renderWebviewHtml(nonce, webview.cspSource, webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css')).toString(), webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')).toString(), renderBody(this.state, this.selectedFile, this.orchestrator?.getHistory() ?? [], this.listSessions(), this.timeoutSeconds));
  }
  private async handle(value: unknown): Promise<void> {
    const message = parsePanelMessage(value);
    let flow = this.orchestrator;
    if (!message) return;
    if (message.type === 'openFile') {
      this.selectedFile = moveFileSelection(message.index, 0, flow?.getPrepared().length ?? 0);
      await this.syncFileSelection(); await this.openSelected(); return;
    }
    if (message.type === 'previousFile' || message.type === 'nextFile') {
      this.selectedFile = moveFileSelection(this.selectedFile, message.type === 'nextFile' ? 1 : -1, flow?.getPrepared().length ?? 0);
      await this.syncFileSelection(); await this.openSelected(); return;
    }
    if (message.type === 'submitGoal' && !flow) flow = await this.ensureSession();
    if (!flow) return;
    if (message.type === 'stop') flow.stop();
    else if (message.type === 'submitGoal') await flow.submitGoal(message.goal);
    else if (message.type === 'sendMessage') await flow.rejectChunk(message.message);
    else if (message.type === 'approvePlan') await flow.approvePlan();
    else if (message.type === 'approveChunk') await flow.approveChunk();
    else if (message.type === 'rejectChunk') await flow.rejectChunk();
    else if (message.type === 'retry') await flow.retry();
    else if (message.type === 'resume') await flow.resume();
    else if (message.type === 'cancelSession') { flow.cancel(); }
    else if (message.type === 'reset') await this.startNewStory(flow);
  }

  private async startNewStory(flow: PairOrchestrator): Promise<void> {
    const active = !['idle', 'completed', 'canceled'].includes(flow.current.phase);
    if (active) {
      const choice = await vscode.window.showWarningMessage('Cancel the current Pair Flow session and start a new story?', { modal: true }, 'Cancel session');
      if (choice !== 'Cancel session') return;
      flow.cancel();
    }
    this.orchestrator = undefined;
    this.state = initialState();
    this.selectedFile = 0;
    this.lastChunk = undefined;
    this.draw();
  }
  private async openSelected(): Promise<void> {
    const prepared = this.orchestrator?.getPrepared() ?? [];
    const edit = prepared[this.selectedFile];
    if (!edit) return;
    const uris = this.diffs.prepare(edit);
    await vscode.commands.executeCommand('vscode.diff', uris.current, uris.proposed, `Pair Flow ${this.selectedFile + 1}/${prepared.length} — ${edit.path}`, { preview: true });
  }

  private ensureRestored(): Promise<void> {
    if (!this.restorePromise) {
      this.restorePromise = Promise.resolve().then(() => this.restoreSession()).then(orchestrator => {
        if (orchestrator && !this.orchestrator) this.bind(orchestrator);
      });
    }
    return this.restorePromise;
  }

  private async syncFileSelection(): Promise<void> {
    const count = this.orchestrator?.getPrepared().length ?? 0;
    await this.view?.webview.postMessage({ type: 'fileSelection', index: this.selectedFile, count });
  }
}
