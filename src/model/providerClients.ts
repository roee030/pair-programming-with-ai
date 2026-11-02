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
    this.baseUrl = (options.baseUrl?.trim() || fallback.baseUrl).replace(/\/$/, '');
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
      return response.json();
    } catch (error) {
      if (controller.signal.aborted) throw new Error(timedOut ? `${this.options.provider} request timed out` : 'Task stopped');
      throw error;
    } finally { clearTimeout(timer); this.activeRequests.delete(controller); }
  }
}

function required(value: string | undefined): string { if (!value) throw new Error('Model returned an empty response'); return value; }
const PLAN_PROMPT = `You are a careful pair programmer. Return JSON only: {"summary":"what we will do","steps":["small step"]}. Return 3-6 concise chapters. Each chapter is a short action title under 12 words, independently understandable and reviewable. Do not include alternate branches, conditional advice, implementation detail, or code.`;
const CHUNK_PROMPT = `Return JSON only: {"stepIndex":0,"title":"","explanation":"","edits":[{"path":"relative/path","content":"complete new file content"}],"verification":"optional safe command"}. One coherent change, at most 3 text files. Never use absolute paths.`;
