import * as vscode from 'vscode';
export async function setApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const key = await vscode.window.showInputBox({ title: 'Pair Flow API key', prompt: 'Stored securely in VS Code SecretStorage', password: true, ignoreFocusOut: true });
  if (key?.trim()) { await secrets.store('pairFlow.apiKey', key.trim()); void vscode.window.showInformationMessage('Pair Flow API key saved.'); }
}
export async function getConfiguration(secrets: vscode.SecretStorage) {
  const config = vscode.workspace.getConfiguration('pairFlow');
  return { apiKey: await secrets.get('pairFlow.apiKey') ?? '', baseUrl: config.get<string>('baseUrl', 'https://api.openai.com/v1'), model: config.get<string>('model', 'gpt-5-mini') };
}
