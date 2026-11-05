import { describe, expect, it, vi } from 'vitest';
import { ReloadingModelClient } from './reloadingModelClient';
import type { ModelClient } from './modelClient';

describe('ReloadingModelClient', () => {
  it('builds a client from the current settings for every request, so a newly chosen model applies on retry', async () => {
    let model = 'gtp 5 mini';
    const seen: string[] = [];
    const client = new ReloadingModelClient(async () => {
      const current = model;
      return { requestPlan: async () => { seen.push(current); return { summary: current, steps: ['A'] }; }, requestChunk: vi.fn() } as ModelClient;
    });
    await client.requestPlan('goal', 'ctx');
    model = 'gpt-5-mini';
    await client.requestPlan('goal', 'ctx');
    expect(seen).toEqual(['gtp 5 mini', 'gpt-5-mini']);
  });

  it('cancels the request in flight', async () => {
    const cancel = vi.fn();
    let release!: () => void;
    const client = new ReloadingModelClient(async () => ({ requestPlan: () => new Promise(resolve => { release = () => resolve({ summary: 'S', steps: [] }); }), requestChunk: vi.fn(), cancel }));
    const pending = client.requestPlan('goal', 'ctx');
    await new Promise(resolve => setTimeout(resolve, 0));
    client.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    release(); await pending;
  });
});
