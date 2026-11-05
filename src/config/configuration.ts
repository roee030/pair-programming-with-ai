import * as vscode from 'vscode';
import { providerDefaults, type Provider } from '../model/providerClients';
import { baseUrlChoice, validateBaseUrlInput } from './baseUrlInput';
import { clampMaxContextFiles } from './contextLimits';

export async function setApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const provider = getProvider();
  if (provider === 'ollama') void vscode.window.showInformationMessage('Ollama runs locally and does not require an API key.');
  else {
    const key = await vscode.window.showInputBox({ title: `Pair Flow ${providerLabel(provider)} API key (1/2)`, prompt: 'Stored securely in VS Code SecretStorage', password: true, ignoreFocusOut: true });
    if (key === undefined) return;
    if (key.trim()) { await secrets.store(secretKey(provider), key.trim()); void vscode.window.showInformationMessage(`${providerLabel(provider)} API key saved.`); }
  }
  await promptBaseUrl(provider);
}

/** Optional step after the key: Enter on an empty box uses the provider's default API address. */
async function promptBaseUrl(provider: Provider): Promise<void> {
  const config = vscode.workspace.getConfiguration('pairFlow');
  const fallback = providerDefaults(provider).baseUrl;
  const input = await vscode.window.showInputBox({
    title: `Pair Flow ${providerLabel(provider)} base URL (${provider === 'ollama' ? 'optional' : '2/2, optional'})`,
    prompt: `Press Enter with an empty box to use the default: ${fallback}. Only set this for a proxy or gateway. It is an API address, not a website.`,
    placeHolder: fallback,
    value: config.get<string>('baseUrl', ''),
    ignoreFocusOut: true,
    validateInput: validateBaseUrlInput
  });
  const choice = baseUrlChoice(input);
  if (choice.action === 'keep') return;
  const value = choice.action === 'set' ? choice.value : undefined;
  // Write to every scope that currently defines the setting, so a workspace value cannot silently override the choice.
  const inspected = config.inspect<string>('baseUrl');
  const targets: vscode.ConfigurationTarget[] = [vscode.ConfigurationTarget.Global];
  if (inspected?.workspaceValue !== undefined) targets.push(vscode.ConfigurationTarget.Workspace);
  for (const target of targets) await config.update('baseUrl', value, target);
  void vscode.window.showInformationMessage(value ? `Pair Flow will call ${value}.` : `Pair Flow will use the default ${providerLabel(provider)} address (${fallback}).`);
}
export async function getConfiguration(secrets: vscode.SecretStorage) {
  const config = vscode.workspace.getConfiguration('pairFlow');
  const provider = getProvider();
  const requestTimeoutSeconds = Math.max(30, Math.min(600, config.get<number>('requestTimeoutSeconds', 120)));
  const maxContextFiles = clampMaxContextFiles(config.get<number>('maxContextFiles'));
  return { provider, apiKey: await secrets.get(secretKey(provider)) ?? '', baseUrl: config.get<string>('baseUrl', ''), model: config.get<string>('model', ''), requestTimeoutSeconds, timeoutMs: requestTimeoutSeconds * 1000, maxContextFiles };
}
function getProvider(): Provider { return vscode.workspace.getConfiguration('pairFlow').get<Provider>('provider', 'openai'); }
function secretKey(provider: Provider): string { return `pairFlow.apiKey.${provider}`; }
function providerLabel(provider: Provider): string { return ({ openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', openrouter: 'OpenRouter', ollama: 'Ollama' })[provider]; }
