import * as vscode from 'vscode';
import type { PreparedEdit } from '../workspace/workspaceAdapter';

export class PairDiffProvider implements vscode.TextDocumentContentProvider {
  private readonly documents = new Map<string, string>();
  provideTextDocumentContent(uri: vscode.Uri): string { return this.documents.get(uri.toString()) ?? ''; }
  prepare(edit: PreparedEdit): { current: vscode.Uri; proposed: vscode.Uri } {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `/${edit.path.replace(/\\/g, '/')}`;
    const current = vscode.Uri.from({ scheme: 'pairflow-diff', path, query: `id=${id}&side=current` });
    const proposed = vscode.Uri.from({ scheme: 'pairflow-diff', path, query: `id=${id}&side=proposed` });
    this.documents.set(current.toString(), edit.currentContent);
    this.documents.set(proposed.toString(), edit.content);
    return { current, proposed };
  }
}
