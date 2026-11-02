import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { PairOrchestrator } from '../orchestrator/pairOrchestrator';
import type { SessionState } from '../session/types';
import { parsePanelMessage } from './panelMessages';
import { renderBody, renderWebviewHtml } from './webviewHtml';

export class PairFlowPanel {
  private orchestrator?: PairOrchestrator;
  private constructor(private readonly panel: vscode.WebviewPanel, private readonly extensionUri: vscode.Uri) {
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] };
    panel.webview.onDidReceiveMessage(value => void this.handle(value));
  }
  static create(extensionUri: vscode.Uri): PairFlowPanel {
    return new PairFlowPanel(vscode.window.createWebviewPanel('pairFlow', 'Pair Flow', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true }), extensionUri);
  }
  bind(orchestrator: PairOrchestrator): void { this.orchestrator = orchestrator; this.render(orchestrator.current); }
  render(state: SessionState): void {
    const webview = this.panel.webview; const nonce = randomBytes(16).toString('base64');
    this.panel.webview.html = renderWebviewHtml(nonce, webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css')).toString(), webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')).toString(), renderBody(state));
  }
  private async handle(value: unknown): Promise<void> {
    const message = parsePanelMessage(value); const flow = this.orchestrator; if (!message || !flow) return;
    if (message.type === 'submitGoal') await flow.submitGoal(message.goal);
    else if (message.type === 'approvePlan') await flow.approvePlan();
    else if (message.type === 'approveChunk') await flow.approveChunk();
    else if (message.type === 'rejectChunk') await flow.rejectChunk();
    else if (message.type === 'revise') { const feedback = await vscode.window.showInputBox({ title: 'How should this chunk change?', prompt: 'Be specific; no files will be changed.' }); if (feedback) await flow.rejectChunk(feedback); }
    else if (message.type === 'preview') await this.preview(flow);
    else if (message.type === 'retry') flow.retry(); else if (message.type === 'reset') flow.reset();
  }
  private async preview(flow: PairOrchestrator): Promise<void> {
    const edit = flow.getPrepared()[0]; if (!edit) return;
    const proposed = await vscode.workspace.openTextDocument({ content: edit.content, language: languageFor(edit.path) });
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(edit.absolutePath), proposed.uri, `Current ↔ Proposed — ${edit.path}`);
  }
}
function languageFor(file: string): string | undefined { const extension = file.split('.').pop(); return ({ ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact', json: 'json', md: 'markdown', py: 'python' } as Record<string, string>)[extension ?? '']; }
