import * as vscode from 'vscode';
import type { SessionFileStore } from './sessionRepository';

export class VscodeSessionFileStore implements SessionFileStore {
  constructor(private readonly root: vscode.Uri) {}

  async read(name: string): Promise<string | undefined> {
    try { return Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.root, name))).toString('utf8'); }
    catch (error) { if ((error as { code?: string }).code === 'FileNotFound') return undefined; throw error; }
  }

  async write(name: string, value: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.root);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.root, name), Buffer.from(value, 'utf8'));
  }

  async delete(name: string): Promise<void> {
    try { await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.root, name)); }
    catch (error) { if ((error as { code?: string }).code !== 'FileNotFound') throw error; }
  }
}
