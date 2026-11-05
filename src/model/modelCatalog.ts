import type { Provider } from './providerClients';

export type ModelOption = { id: string; label: string; detail?: string };

/**
 * Suggested models per provider. The first entry is the provider default used when `pairFlow.model` is empty.
 * The picker also offers the models the provider reports for the user's key, and a free-text option for anything else.
 */
const catalog: Record<Provider, ModelOption[]> = {
  openai: [
    { id: 'gpt-5-mini', label: 'GPT-5 mini', detail: 'Fast and low cost. Recommended default.' },
    { id: 'gpt-5', label: 'GPT-5', detail: 'Strongest OpenAI reasoning model.' },
    { id: 'gpt-5-nano', label: 'GPT-5 nano', detail: 'Cheapest, for small changes.' },
    { id: 'gpt-4.1', label: 'GPT-4.1', detail: 'Non-reasoning model with a long context window.' }
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', detail: 'Balanced speed and quality. Recommended default.' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', detail: 'Newer Sonnet.' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', detail: 'Most capable Claude model.' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', detail: 'Fastest and cheapest Claude model.' }
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', detail: 'Fast. Recommended default.' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', detail: 'Strong reasoning.' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', detail: 'Fast and low cost.' }
  ],
  openrouter: [
    { id: 'openai/gpt-5-mini', label: 'OpenAI GPT-5 mini', detail: 'Recommended default.' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Anthropic Claude Sonnet 4.5' },
    { id: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
    { id: 'qwen/qwen3-coder', label: 'Qwen3 Coder' }
  ],
  ollama: [
    { id: 'qwen3-coder', label: 'Qwen3 Coder', detail: 'Recommended default. Run `ollama pull qwen3-coder` first.' },
    { id: 'llama3.1', label: 'Llama 3.1' },
    { id: 'deepseek-coder-v2', label: 'DeepSeek Coder V2' }
  ]
};

export function suggestedModels(provider: Provider): readonly ModelOption[] { return catalog[provider]; }

/** The model Pair Flow sends: the configured one, or the provider default when the setting is empty. */
export function effectiveModel(provider: Provider, configured: string | undefined): string {
  return configured?.trim() || defaultModel(provider);
}

export function defaultModel(provider: Provider): string { return catalog[provider][0].id; }

/** Merges the suggested list with the models the provider reported, without duplicates, suggestions first. */
export function mergeModelOptions(provider: Provider, reported: readonly string[]): ModelOption[] {
  const options = [...catalog[provider]];
  const known = new Set(options.map(option => option.id));
  for (const id of reported) {
    const trimmed = id.trim();
    if (!trimmed || known.has(trimmed)) continue;
    known.add(trimmed);
    options.push({ id: trimmed, label: trimmed });
  }
  return options;
}

/** Validation for the free-text model box: returns an error message, or undefined when the value is usable. */
export function validateModelInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a model id, for example gpt-5-mini.';
  if (/\s/.test(trimmed)) return 'Model ids have no spaces. Use dashes, for example gpt-5-mini.';
  return undefined;
}

const squash = (value: string) => value.toLowerCase().replace(/gtp/g, 'gpt').replace(/[^a-z0-9]/g, '');

/** Finds the suggested or reported model the user most likely meant, for typos such as "gtp 5 mini". */
export function closestModel(provider: Provider, input: string, reported: readonly string[] = []): string | undefined {
  const target = squash(input);
  if (!target) return undefined;
  const candidates = mergeModelOptions(provider, reported).map(option => option.id);
  const exact = candidates.find(id => squash(id) === target);
  if (exact) return exact === input.trim() ? undefined : exact;
  let best: { id: string; distance: number } | undefined;
  for (const id of candidates) {
    const distance = editDistance(target, squash(id));
    if (!best || distance < best.distance) best = { id, distance };
  }
  return best && best.distance <= Math.max(2, Math.floor(target.length / 4)) ? best.id : undefined;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
