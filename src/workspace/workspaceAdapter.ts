import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { validateEdits, type ValidatedEdit } from './editValidation';
import type { ProposedEdit } from '../session/types';
import { documentEnd } from './textRange';

export type PreparedEdit = ValidatedEdit & { currentHash: string; currentContent: string };
export class WorkspaceAdapter {
  constructor(private readonly root: vscode.Uri) {}
  async context(maxFiles = 12): Promise<string> {
    const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,json,md,py,go,rs,java,cs}', '**/{node_modules,dist,.git}/**', maxFiles);
    const parts: string[] = [];
    for (const file of files) {
      const bytes = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(bytes).toString('utf8');
      if (!text.includes('\0') && text.length < 50_000) parts.push(`--- ${vscode.workspace.asRelativePath(file)}\n${text}`);
    }
    return parts.join('\n\n');
  }
  async prepare(edits: ProposedEdit[]): Promise<PreparedEdit[]> {
    const validated = validateEdits(this.root.fsPath, edits);
    return Promise.all(validated.map(async edit => { const current = await this.read(edit.absolutePath); return { ...edit, currentHash: hash(current), currentContent: current ?? '' }; }));
  }
  async apply(prepared: PreparedEdit[]): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const edit of prepared) {
      const current = await this.read(edit.absolutePath);
      if (hash(current) !== edit.currentHash || (edit.originalHash && edit.originalHash !== hash(current))) throw new Error(`File changed since preview: ${edit.path}`);
      const uri = vscode.Uri.file(edit.absolutePath);
      if (current === undefined) {
        workspaceEdit.createFile(uri, { ignoreIfExists: false });
        workspaceEdit.insert(uri, new vscode.Position(0, 0), edit.content);
      } else {
        const end = documentEnd(current);
        workspaceEdit.replace(uri, new vscode.Range(0, 0, end.line, end.character), edit.content);
      }
    }
    if (!await vscode.workspace.applyEdit(workspaceEdit)) throw new Error('VS Code could not apply the approved change');
  }
  private async read(file: string): Promise<string | undefined> {
    try { return Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(file))).toString('utf8'); }
    catch (error) { if ((error as { code?: string }).code === 'FileNotFound') return undefined; throw error; }
  }
}
function hash(value: string | undefined): string { return createHash('sha256').update(value ?? '<missing>').digest('hex'); }
