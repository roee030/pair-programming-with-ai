import { describe, expect, it } from 'vitest';
import { SessionRepository } from './sessionRepository';
import type { PersistedSession } from './types';

class MemoryState {
  data = new Map<string, unknown>();
  get<T>(key: string, fallback: T): T { return (this.data.get(key) as T | undefined) ?? fallback; }
  async update(key: string, value: unknown): Promise<void> { this.data.set(key, value); }
}

class MemoryFiles {
  data = new Map<string, string>();
  async read(name: string): Promise<string | undefined> { return this.data.get(name); }
  async write(name: string, value: string): Promise<void> { this.data.set(name, value); }
  async delete(name: string): Promise<void> { this.data.delete(name); }
}

const session = (overrides: Partial<PersistedSession> = {}): PersistedSession => ({
  version: 1,
  id: 'session-1',
  title: 'Add durable history',
  status: 'active',
  updatedAt: '2026-11-03T17:00:00.000Z',
  state: { phase: 'awaitingPlanApproval', currentStep: 0, goal: 'Add durable history' },
  history: [],
  ...overrides
});

describe('SessionRepository', () => {
  it('persists the active session body and a lightweight summary', async () => {
    const state = new MemoryState();
    const files = new MemoryFiles();
    const repository = new SessionRepository(state, files);

    await repository.save(session());

    expect(await repository.loadActive()).toEqual(session());
    expect(repository.list()).toEqual([{ id: 'session-1', title: 'Add durable history', status: 'active', updatedAt: '2026-11-03T17:00:00.000Z' }]);
  });

  it('loads an interrupted running phase as paused without changing its history', async () => {
    const state = new MemoryState();
    const files = new MemoryFiles();
    const repository = new SessionRepository(state, files);
    await repository.save(session({ state: { phase: 'requestingChunk', currentStep: 1, goal: 'Resume me' } }));

    const restored = await repository.loadActive();

    expect(restored?.status).toBe('paused');
    expect(restored?.state.phase).toBe('paused');
    expect(repository.list()[0].status).toBe('paused');
  });

  it('restores a saved failure as paused so a stale error is not shown again after restart', async () => {
    const state = new MemoryState();
    const files = new MemoryFiles();
    const repository = new SessionRepository(state, files);
    await repository.save(session({ state: { phase: 'error', currentStep: 0, goal: 'Retry me', error: 'Unexpected token \'<\', "<!DOCTYPE"... is not valid JSON', resumePhase: 'planning' } }));

    const restored = await repository.loadActive();

    expect(restored?.status).toBe('paused');
    expect(restored?.state).toEqual({ phase: 'paused', currentStep: 0, goal: 'Retry me', resumePhase: 'planning' });
  });

  it('rejects malformed and unsupported session files safely', async () => {
    const state = new MemoryState();
    const files = new MemoryFiles();
    state.data.set('pairFlow.sessions', [{ id: 'broken', title: 'Broken', status: 'active', updatedAt: 'now' }]);
    files.data.set('session-broken.json', '{not-json');
    const repository = new SessionRepository(state, files);

    expect(await repository.loadActive()).toBeUndefined();
    files.data.set('session-broken.json', JSON.stringify({ ...session(), id: 'broken', version: 2 }));
    expect(await repository.loadActive()).toBeUndefined();
  });

  it('keeps only the twenty newest summaries', async () => {
    const repository = new SessionRepository(new MemoryState(), new MemoryFiles());
    for (let index = 0; index < 22; index++) {
      await repository.save(session({ id: `session-${index}`, updatedAt: new Date(index * 1000).toISOString() }));
    }

    expect(repository.list()).toHaveLength(20);
    expect(repository.list()[0].id).toBe('session-21');
    expect(repository.list().at(-1)?.id).toBe('session-2');
  });

  it('keeps only one resumable session and removes completed transcript bodies', async () => {
    const state = new MemoryState();
    const files = new MemoryFiles();
    const repository = new SessionRepository(state, files);
    await repository.save(session({ id: 'first' }));
    await repository.save(session({ id: 'second', updatedAt: '2026-11-03T18:00:00.000Z' }));

    expect(repository.list().find(item => item.id === 'first')?.status).toBe('canceled');
    expect(files.data.has('session-first.json')).toBe(false);

    await repository.save(session({ id: 'second', status: 'done', state: { phase: 'completed', currentStep: 1 } }));
    expect(repository.list().find(item => item.id === 'second')?.status).toBe('done');
    expect(files.data.has('session-second.json')).toBe(false);
    expect(await repository.loadActive()).toBeUndefined();
  });
});
