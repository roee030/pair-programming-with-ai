import type { Chunk, Plan } from '../session/types';
import type { ModelClient } from './modelClient';
import { parseChunkResponse, parsePlanResponse } from './protocol';

export type Provider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama';
export type ProviderOptions = { provider: Provider; apiKey: string; model?: string; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number };

const defaults: Record<Provider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.8-flash' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-5-mini' },
  ollama: { baseUrl: 'http://localhost:11434', model: 'qwen3-coder' }
};

export function providerDefaults(provider: Provider) { return defaults[provider]; }
export function createProviderClient(options: ProviderOptions): ModelClient { return new ProviderClient(options); }

class ProviderClient implements ModelClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly request: typeof fetch;
  private readonly activeRequests = new Set<AbortController>();
  constructor(private readonly options: ProviderOptions) {
    const fallback = providerDefaults(options.provider);
    this.baseUrl = normalizeBaseUrl(options.provider, options.baseUrl?.trim() || fallback.baseUrl);
    this.model = options.model?.trim() || fallback.model;
    this.request = options.fetch ?? fetch;
  }
  async requestPlan(goal: string, context: string): Promise<Plan> {
    return parsePlanResponse(await this.complete(PLAN_PROMPT, `Goal:\n${goal}\n\nWorkspace:\n${context}`));
  }
  async requestChunk(goal: string, plan: Plan, stepIndex: number, context: string, feedback?: string): Promise<Chunk> {
    return parseChunkResponse(await this.complete(CHUNK_PROMPT, JSON.stringify({ goal, plan, stepIndex, context, feedback })));
  }
  cancel(): void { for (const controller of this.activeRequests) controller.abort(); this.activeRequests.clear(); }
  private async complete(system: string, user: string): Promise<string> {
    if (this.options.provider !== 'ollama' && !this.options.apiKey) throw new Error(`Set your ${this.options.provider} API key first`);
    switch (this.options.provider) {
      case 'anthropic': return this.anthropic(system, user);
      case 'gemini': return this.gemini(system, user);
      case 'ollama': return this.ollama(system, user);
      default: return this.openAI(system, user);
    }
  }
  private async openAI(system: string, user: string): Promise<string> {
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` };
    if (this.options.provider === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/roee030/pair-programming-with-ai'; headers['X-Title'] = 'Pair Flow'; }
    const data = await this.post(`${this.baseUrl}/chat/completions`, headers, { model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' } }) as { choices?: { message?: { content?: string } }[] };
    return required(data.choices?.[0]?.message?.content);
  }
  private async anthropic(system: string, user: string): Promise<string> {
    const data = await this.post(`${this.baseUrl}/messages`, { 'content-type': 'application/json', 'x-api-key': this.options.apiKey, 'anthropic-version': '2023-06-01' }, { model: this.model, max_tokens: 8192, system, messages: [{ role: 'user', content: user }] }) as { content?: { type?: string; text?: string }[] };
    return required(data.content?.find(part => part.type === 'text')?.text);
  }
  private async gemini(system: string, user: string): Promise<string> {
    const data = await this.post(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey }, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json' } }) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return required(data.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join(''));
  }
  private async ollama(system: string, user: string): Promise<string> {
    const data = await this.post(`${this.baseUrl}/api/chat`, { 'content-type': 'application/json' }, { model: this.model, stream: false, format: 'json', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) as { message?: { content?: string } };
    return required(data.message?.content);
  }
  private async post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    this.activeRequests.add(controller);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.options.timeoutMs ?? 120_000);
    try {
      const response = await this.request(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) { const detail = await response.text(); throw new Error(`${this.options.provider} request failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`); }
      return parseJsonResponse(this.options.provider, url, response, Boolean(this.options.baseUrl?.trim()));
    } catch (error) {
      if (controller.signal.aborted) throw new Error(timedOut ? `${this.options.provider} request timed out` : 'Task stopped');
      throw error;
    } finally { clearTimeout(timer); this.activeRequests.delete(controller); }
  }
}

const apiPaths: Partial<Record<Provider, { host: string; path: string; websites: string[] }>> = {
  openai: { host: 'api.openai.com', path: '/v1', websites: ['openai.com', 'www.openai.com', 'platform.openai.com', 'chat.openai.com', 'chatgpt.com', 'www.chatgpt.com'] },
  anthropic: { host: 'api.anthropic.com', path: '/v1', websites: ['anthropic.com', 'www.anthropic.com', 'console.anthropic.com', 'claude.ai', 'www.claude.ai'] },
  openrouter: { host: 'openrouter.ai', path: '/api/v1', websites: ['www.openrouter.ai'] },
  gemini: { host: 'generativelanguage.googleapis.com', path: '/v1beta', websites: ['aistudio.google.com', 'ai.google.dev', 'gemini.google.com'] }
};
const endpointSuffix = /\/(chat\/completions|messages|api\/chat|models\/[^/]+:generateContent)$/i;

/**
 * Fixes common base URL mistakes that make a provider answer with an HTML page:
 * a bare provider host, the provider's website or dashboard instead of its API, or a full endpoint URL.
 */
export function normalizeBaseUrl(provider: Provider, baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '').replace(endpointSuffix, '');
  const known = apiPaths[provider];
  if (!known) return trimmed;
  try {
    const url = new URL(trimmed);
    if (known.websites.includes(url.hostname)) return `https://${known.host}${known.path}`;
    if (url.hostname === known.host && (url.pathname === '' || url.pathname === '/')) return `${url.origin}${known.path}`;
  } catch { /* leave invalid URLs for fetch to report */ }
  return trimmed;
}

async function parseJsonResponse(provider: Provider, url: string, response: Response, customBaseUrl: boolean): Promise<unknown> {
  const text = await response.text();
  try { return JSON.parse(text); } catch {
    const contentType = response.headers.get('content-type') ?? 'unknown content type';
    const looksHtml = /^\s*</.test(text);
    const hint = !looksHtml ? '' : customBaseUrl
      ? ' The server returned an HTML page instead of an API response. Your "pairFlow.baseUrl" setting points somewhere that is not the provider API: clear it to use the default endpoint, or set it to your gateway\'s API URL.'
      : ' The server returned an HTML page instead of an API response, even though Pair Flow used the default endpoint. A proxy, VPN, firewall, or captive portal on this network is probably intercepting the request. Check VS Code\'s "http.proxy" setting and your network.';
    throw new Error(`${provider} returned a non-JSON response (${response.status}, ${contentType}) from ${url}.${hint}`);
  }
}

function required(value: string | undefined): string { if (!value) throw new Error('Model returned an empty response'); return value; }
const PLAN_PROMPT = `You are a careful pair programmer. Return JSON only: {"summary":"what we will do","steps":["small step"]}. Return 3-6 concise chapters. Each chapter is a short action title under 12 words, independently understandable and reviewable. Do not include alternate branches, conditional advice, implementation detail, or code.`;
const CHUNK_PROMPT = `Return JSON only: {"stepIndex":0,"title":"","explanation":"","edits":[{"path":"relative/path","content":"complete new file content"}],"verification":"optional safe command"}. One coherent change, at most 3 text files. Never use absolute paths.`;
