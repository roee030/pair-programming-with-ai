import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { PairOrchestrator } from '../orchestrator/pairOrchestrator';
import { initialState } from '../session/sessionMachine';
import type { Chunk, SessionState } from '../session/types';
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
  constructor(private readonly extensionUri: vscode.Uri, private readonly diffs: PairDiffProvider, private readonly createSession: () => Promise<PairOrchestrator | undefined>) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
    view.webview.onDidReceiveMessage(value => void this.handle(value));
    this.draw();
  }
  bind(orchestrator: PairOrchestrator): void { this.orchestrator = orchestrator; this.render(orchestrator.current); }
  async ensureSession(): Promise<PairOrchestrator | undefined> {
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
    webview.html = renderWebviewHtml(nonce, webview.cspSource, webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css')).toString(), webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')).toString(), renderBody(this.state, this.selectedFile));
  }
  private async handle(value: unknown): Promise<void> {
    const message = parsePanelMessage(value);
    let flow = this.orchestrator;
    if (!message) return;
    if (message.type === 'openFile') {
      this.selectedFile = moveFileSelection(message.index, 0, flow?.getPrepared().length ?? 0);
      this.draw(); await this.openSelected(); return;
    }
    if (message.type === 'previousFile' || message.type === 'nextFile') {
      this.selectedFile = moveFileSelection(this.selectedFile, message.type === 'nextFile' ? 1 : -1, flow?.getPrepared().length ?? 0);
      this.draw(); await this.openSelected(); return;
    }
    if (message.type === 'submitGoal' && !flow) flow = await this.ensureSession();
    if (!flow) return;
    if (message.type === 'submitGoal') await flow.submitGoal(message.goal);
    else if (message.type === 'approvePlan') await flow.approvePlan();
    else if (message.type === 'approveChunk') await flow.approveChunk();
    else if (message.type === 'rejectChunk') await flow.rejectChunk();
    else if (message.type === 'revise') {
      const feedback = await vscode.window.showInputBox({ title: 'How should this chapter change?', prompt: 'Ask a question or describe the revision. No files will be changed.' });
      if (feedback) await flow.rejectChunk(feedback);
    } else if (message.type === 'retry') flow.retry();
    else if (message.type === 'reset') flow.reset();
  }
  private async openSelected(): Promise<void> {
    const prepared = this.orchestrator?.getPrepared() ?? [];
    const edit = prepared[this.selectedFile];
    if (!edit) return;
    const uris = this.diffs.prepare(edit);
    await vscode.commands.executeCommand('vscode.diff', uris.current, uris.proposed, `Pair Flow ${this.selectedFile + 1}/${prepared.length} — ${edit.path}`, { preview: true });
  }
}
