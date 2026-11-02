import * as vscode from 'vscode';
import type { Provider } from '../model/providerClients';

export async function setApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const provider = getProvider();
  if (provider === 'ollama') { void vscode.window.showInformationMessage('Ollama runs locally and does not require an API key.'); return; }
  const key = await vscode.window.showInputBox({ title: `Pair Flow ${providerLabel(provider)} API key`, prompt: 'Stored securely in VS Code SecretStorage', password: true, ignoreFocusOut: true });
  if (key?.trim()) { await secrets.store(secretKey(provider), key.trim()); void vscode.window.showInformationMessage(`${providerLabel(provider)} API key saved.`); }
}
export async function getConfiguration(secrets: vscode.SecretStorage) {
  const config = vscode.workspace.getConfiguration('pairFlow');
  const provider = getProvider();
  return { provider, apiKey: await secrets.get(secretKey(provider)) ?? '', baseUrl: config.get<string>('baseUrl', ''), model: config.get<string>('model', '') };
}
function getProvider(): Provider { return vscode.workspace.getConfiguration('pairFlow').get<Provider>('provider', 'openai'); }
function secretKey(provider: Provider): string { return `pairFlow.apiKey.${provider}`; }
function providerLabel(provider: Provider): string { return ({ openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', openrouter: 'OpenRouter', ollama: 'Ollama' })[provider]; }
