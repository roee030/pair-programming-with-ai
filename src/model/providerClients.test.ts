import { describe, expect, it, vi } from 'vitest';
import { createProviderClient, fetchModelIds, modelIdsFrom, normalizeBaseUrl, providerDefaults } from './providerClients';

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

describe('provider response handling', () => {
  it('explains an HTML page returned with status 200 instead of a raw JSON parse error', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('<!DOCTYPE html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const client = createProviderClient({ provider: 'openai', apiKey: 'key', baseUrl: 'https://example.com/v1', fetch });
    await expect(client.requestPlan('goal', 'context')).rejects.toThrow(/non-JSON response \(200, text\/html\) from https:\/\/example\.com\/v1\/chat\/completions.*pairFlow\.baseUrl/);
  });

  it('adds the API path when the base URL is only the provider host', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"S","steps":["A"]}' } }] }), { status: 200 }));
    const client = createProviderClient({ provider: 'openrouter', apiKey: 'key', baseUrl: 'https://openrouter.ai/', fetch });
    await client.requestPlan('goal', 'context');
    expect(fetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
});

describe('base URL normalization', () => {
  it.each([
    ['openai', 'https://platform.openai.com/api-keys', 'https://api.openai.com/v1'],
    ['openai', 'https://chatgpt.com', 'https://api.openai.com/v1'],
    ['openai', 'https://api.openai.com/v1/chat/completions', 'https://api.openai.com/v1'],
    ['openai', 'https://api.openai.com', 'https://api.openai.com/v1'],
    ['anthropic', 'https://console.anthropic.com/settings/keys', 'https://api.anthropic.com/v1'],
    ['gemini', 'https://aistudio.google.com/apikey', 'https://generativelanguage.googleapis.com/v1beta'],
    ['openrouter', 'https://openrouter.ai/', 'https://openrouter.ai/api/v1'],
    ['openai', 'https://my-gateway.example.com/v1/', 'https://my-gateway.example.com/v1'],
    ['ollama', 'http://localhost:11434/api/chat', 'http://localhost:11434']
  ] as const)('%s: %s -> %s', (provider, input, expected) => {
    expect(normalizeBaseUrl(provider, input)).toBe(expected);
  });

  it('blames the network, not the setting, when the default endpoint returns HTML', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('<!DOCTYPE html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const client = createProviderClient({ provider: 'openai', apiKey: 'key', baseUrl: '', fetch });
    await expect(client.requestPlan('goal', 'context')).rejects.toThrow(/default endpoint.*proxy, VPN/);
  });

  it('shows the provider error message and a model fix instead of raw JSON', async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"message":"invalid model ID: gtp 5 mini","code":"model_not_found"}}', { status: 400 }));
    const client = createProviderClient({ provider: 'openai', apiKey: 'key', model: 'gtp 5 mini', baseUrl: '', fetch });
    const error = await client.requestPlan('goal', 'context').then(() => new Error('expected a failure'), (caught: Error) => caught);
    expect(error.message).toContain('OpenAI request failed (400): invalid model ID: gtp 5 mini');
    expect(error.message).toContain('Did you mean "gpt-5-mini"?');
    expect(error.message).toContain('Pair Flow: Choose Model');
  });

  it('lists the models a key can use from each provider', async () => {
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => response({ data: [{ id: 'gpt-5-mini' }, { id: 'text-embedding-3-small' }, { id: 'gpt-5' }, { id: 'gpt-4o-realtime-preview' }] }));
    expect(await fetchModelIds({ provider: 'openai', apiKey: 'key', fetch })).toEqual(['gpt-5', 'gpt-5-mini']);
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
    expect(modelIdsFrom('anthropic', { data: [{ id: 'claude-sonnet-4-5' }] })).toEqual(['claude-sonnet-4-5']);
    expect(modelIdsFrom('gemini', { models: [{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }] })).toEqual(['gemini-2.5-pro']);
    expect(modelIdsFrom('ollama', { models: [{ name: 'qwen3-coder:latest' }] })).toEqual(['qwen3-coder:latest']);
  });

  it('falls back to an empty model list when listing fails or no key is set', async () => {
    const failing = vi.fn(async () => { throw new Error('offline'); });
    expect(await fetchModelIds({ provider: 'openai', apiKey: 'key', fetch: failing })).toEqual([]);
    const unused = vi.fn(async () => response({}));
    expect(await fetchModelIds({ provider: 'anthropic', apiKey: '', fetch: unused })).toEqual([]);
    expect(unused).not.toHaveBeenCalled();
  });
});
