import * as vscode from 'vscode';
import { fetchModelIds, providerDefaults, type Provider } from '../model/providerClients';
import { effectiveModel, mergeModelOptions, validateModelInput } from '../model/modelCatalog';
import { baseUrlChoice, validateBaseUrlInput } from './baseUrlInput';
import { clampMaxContextFiles } from './contextLimits';

export async function setApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const provider = getProvider();
  if (provider === 'ollama') void vscode.window.showInformationMessage('Ollama runs locally and does not require an API key.');
  else {
    const key = await vscode.window.showInputBox({ title: `Pair Flow ${providerLabel(provider)} API key (1/3)`, prompt: 'Stored securely in VS Code SecretStorage', password: true, ignoreFocusOut: true });
    if (key === undefined) return;
    if (key.trim()) { await secrets.store(secretKey(provider), key.trim()); void vscode.window.showInformationMessage(`${providerLabel(provider)} API key saved.`); }
  }
  await promptBaseUrl(provider);
  await pickModel(secrets, provider, provider === 'ollama' ? 'Step 2/2' : 'Step 3/3');
}

const providers: Provider[] = ['openai', 'anthropic', 'gemini', 'openrouter', 'ollama'];

/** "Pair Flow: Choose Model": pick the provider, then a model from a list, or type any model id. */
export async function chooseModel(secrets: vscode.SecretStorage): Promise<boolean> {
  const current = getProvider();
  const picked = await vscode.window.showQuickPick(providers.map(provider => ({
    label: providerLabel(provider), provider,
    description: provider === current ? 'current' : undefined,
    detail: `Default model: ${providerDefaults(provider).model}`
  })), { title: 'Pair Flow: choose provider (1/2)', placeHolder: `Current: ${providerLabel(current)}`, ignoreFocusOut: true });
  if (!picked) return false;
  if (picked.provider !== current) {
    await updateEverywhere('provider', picked.provider);
    // Switching provider invalidates a model id from the old provider.
    await updateEverywhere('model', undefined);
    if (picked.provider !== 'ollama' && !(await secrets.get(secretKey(picked.provider)))) {
      const key = await vscode.window.showInputBox({ title: `Pair Flow ${providerLabel(picked.provider)} API key`, prompt: 'Stored securely in VS Code SecretStorage', password: true, ignoreFocusOut: true });
      if (key?.trim()) await secrets.store(secretKey(picked.provider), key.trim());
    }
  }
  return pickModel(secrets, picked.provider, 'Step 2/2');
}

type ModelItem = vscode.QuickPickItem & { model?: string; action?: 'custom' | 'default' };

async function pickModel(secrets: vscode.SecretStorage, provider: Provider, step: string): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('pairFlow');
  const configured = config.get<string>('model', '');
  const current = effectiveModel(provider, configured);
  const fallback = providerDefaults(provider).model;
  const quickPick = vscode.window.createQuickPick<ModelItem>();
  quickPick.title = `Pair Flow ${providerLabel(provider)} model (${step})`;
  quickPick.placeholder = `Current: ${current}. Pick a model, or choose "Other model…" to type any id.`;
  quickPick.ignoreFocusOut = true;
  quickPick.matchOnDetail = true;
  const build = (reported: readonly string[], loading: boolean): ModelItem[] => {
    const suggested = new Set(mergeModelOptions(provider, []).map(option => option.id));
    const all = mergeModelOptions(provider, reported);
    if (!all.some(option => option.id === current)) all.unshift({ id: current, label: current, detail: 'Your current setting.' });
    const row = (option: { id: string; label: string; detail?: string }): ModelItem => ({
      label: option.id, model: option.id, detail: option.detail,
      description: [option.id === current ? 'current' : '', option.id === fallback ? 'default' : '', option.label !== option.id ? option.label : ''].filter(Boolean).join(' · ') || undefined
    });
    const items: ModelItem[] = [{ label: 'Suggested', kind: vscode.QuickPickItemKind.Separator }, ...all.filter(option => suggested.has(option.id) || option.id === current).map(row)];
    const extra = all.filter(option => !suggested.has(option.id) && option.id !== current);
    if (extra.length) items.push({ label: `Available for your ${providerLabel(provider)} account`, kind: vscode.QuickPickItemKind.Separator }, ...extra.map(row));
    items.push({ label: 'More', kind: vscode.QuickPickItemKind.Separator },
      { label: '$(edit) Other model…', action: 'custom', detail: loading ? 'Loading the models your key can use…' : 'Type any model id your provider supports.' },
      { label: `$(discard) Use the provider default (${fallback})`, action: 'default' });
    return items;
  };
  quickPick.items = build([], true);
  quickPick.busy = true;
  const choice = new Promise<ModelItem | undefined>(resolve => {
    quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]));
    quickPick.onDidHide(() => resolve(undefined));
  });
  quickPick.show();
  void (async () => {
    const reported = await fetchModelIds({ provider, apiKey: await secrets.get(secretKey(provider)) ?? '', baseUrl: config.get<string>('baseUrl', '') });
    quickPick.items = build(reported, false);
    quickPick.busy = false;
  })();
  const selected = await choice;
  quickPick.dispose();
  if (!selected) return false;
  let value: string | undefined = selected.model;
  if (selected.action === 'default') value = undefined;
  if (selected.action === 'custom') {
    const typed = await vscode.window.showInputBox({ title: `Pair Flow ${providerLabel(provider)} model id`, prompt: 'Exact model id from your provider, for example gpt-5-mini or claude-sonnet-4-5.', value: configured, ignoreFocusOut: true, validateInput: validateModelInput });
    if (typed === undefined) return false;
    value = typed.trim();
  }
  await updateEverywhere('model', value);
  void vscode.window.showInformationMessage(`Pair Flow will use ${providerLabel(provider)} ${value ?? fallback}.`);
  return true;
}

/** Writes to every scope that currently defines the setting, so a workspace value cannot silently override the choice. */
async function updateEverywhere(key: string, value: unknown): Promise<void> {
  const config = vscode.workspace.getConfiguration('pairFlow');
  const inspected = config.inspect(key);
  const targets: vscode.ConfigurationTarget[] = [vscode.ConfigurationTarget.Global];
  if (inspected?.workspaceValue !== undefined) targets.push(vscode.ConfigurationTarget.Workspace);
  for (const target of targets) await config.update(key, value, target);
}

/** Optional step after the key: Enter on an empty box uses the provider's default API address. */
async function promptBaseUrl(provider: Provider): Promise<void> {
  const config = vscode.workspace.getConfiguration('pairFlow');
  const fallback = providerDefaults(provider).baseUrl;
  const input = await vscode.window.showInputBox({
    title: `Pair Flow ${providerLabel(provider)} base URL (${provider === 'ollama' ? '1/2, optional' : '2/3, optional'})`,
    prompt: `Press Enter with an empty box to use the default: ${fallback}. Only set this for a proxy or gateway. It is an API address, not a website.`,
    placeHolder: fallback,
    value: config.get<string>('baseUrl', ''),
    ignoreFocusOut: true,
    validateInput: validateBaseUrlInput
  });
  const choice = baseUrlChoice(input);
  if (choice.action === 'keep') return;
  const value = choice.action === 'set' ? choice.value : undefined;
  await updateEverywhere('baseUrl', value);
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
