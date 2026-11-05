import { closestModel } from './modelCatalog';
import type { Provider } from './providerClients';

export const CHOOSE_MODEL_HINT = 'Run "Pair Flow: Choose Model" to pick another model.';
const labels: Record<Provider, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', openrouter: 'OpenRouter', ollama: 'Ollama' };

export function providerLabel(provider: Provider): string { return labels[provider]; }

/** Pulls the human-readable message out of a provider error body (OpenAI, Anthropic, Gemini, OpenRouter, Ollama shapes). */
export function extractErrorMessage(body: string): string {
  const text = body.trim();
  if (!text) return '';
  try {
    const data = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof data.error === 'string') return data.error;
    if (data.error && typeof data.error === 'object' && typeof (data.error as { message?: unknown }).message === 'string') return (data.error as { message: string }).message;
    if (typeof data.message === 'string') return data.message;
  } catch { /* not JSON */ }
  if (/^\s*</.test(text)) return 'The server returned an HTML page instead of an error message.';
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/** True when the provider error is about the model id (unknown, not found, no access). */
export function isModelError(status: number, message: string, body = ''): boolean {
  if (![400, 403, 404, 422].includes(status) || !/model/i.test(message)) return false;
  if (/model_not_found|not_found_error/.test(body)) return true;
  return /(not\s+(be\s+)?(a\s+)?(found|recogni[sz]ed|exist|supported|valid|available)|does not exist|unknown|invalid|no access|do not have access|try pulling)/i.test(message);
}

/** Builds the error shown in the panel: provider, status, the provider's own message, and a fix for model errors. */
export function describeProviderError(provider: Provider, model: string, status: number, body: string): string {
  const message = extractErrorMessage(body);
  const head = `${labels[provider]} request failed (${status})${message ? `: ${message}` : ''}`;
  if (!isModelError(status, message, body)) return head;
  const guess = closestModel(provider, model);
  const suggestion = guess ? ` Did you mean "${guess}"?` : '';
  return `${head}\n\nThe model "${model}" is not available for ${labels[provider]}.${suggestion} ${CHOOSE_MODEL_HINT}`;
}

/** Lets the panel offer a "Choose model" button next to the error. */
export function suggestsModelChange(error: string | undefined): boolean { return !!error && error.includes(CHOOSE_MODEL_HINT); }
