import { describe, expect, it, vi } from 'vitest';
import { createProviderClient, providerDefaults } from './providerClients';

function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('provider clients', () => {
  it('uses OpenAI Chat Completions JSON mode', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => response({ choices: [{ message: { content: '{"summary":"S","steps":["A"]}' } }] }));
    const client = createProviderClient({ provider: 'openai', apiKey: 'key', model: 'gpt-test', baseUrl: '', fetch });
    await client.requestPlan('goal', 'context');
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer key' }) }));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).response_format).toEqual({ type: 'json_object' });
  });

  it('uses Anthropic Messages headers and system field', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => response({ content: [{ type: 'text', text: '{"summary":"S","steps":["A"]}' }] }));
    const client = createProviderClient({ provider: 'anthropic', apiKey: 'key', model: 'claude-test', baseUrl: '', fetch });
    await client.requestPlan('goal', 'context');
    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'key', 'anthropic-version': '2023-06-01' }) }));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).system).toContain('pair programmer');
  });

  it('uses Gemini generateContent and JSON mime type', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => response({ candidates: [{ content: { parts: [{ text: '{"summary":"S","steps":["A"]}' }] } }] }));
    const client = createProviderClient({ provider: 'gemini', apiKey: 'key', model: 'gemini-test', baseUrl: '', fetch });
    await client.requestPlan('goal', 'context');
    expect(fetch.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(fetch.mock.calls[0][1]!.headers).toEqual(expect.objectContaining({ 'x-goog-api-key': 'key' }));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).generationConfig.responseMimeType).toBe('application/json');
  });

  it('uses native Ollama chat without requiring a key', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => response({ message: { content: '{"summary":"S","steps":["A"]}' } }));
    const client = createProviderClient({ provider: 'ollama', apiKey: '', model: 'local-model', baseUrl: '', fetch });
    await client.requestPlan('goal', 'context');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).format).toBe('json');
  });

  it('gives every supported provider usable defaults', () => {
    for (const provider of ['openai', 'anthropic', 'gemini', 'openrouter', 'ollama'] as const) {
      expect(providerDefaults(provider).model).not.toBe('');
      expect(providerDefaults(provider).baseUrl).toMatch(/^https?:\/\//);
    }
  });

  it('aborts a provider request after the configured timeout', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const client = createProviderClient({ provider: 'openai', apiKey: 'key', model: 'test', baseUrl: '', fetch, timeoutMs: 10 });
    await expect(client.requestPlan('goal', 'context')).rejects.toThrow(/timed out/i);
  });
});
