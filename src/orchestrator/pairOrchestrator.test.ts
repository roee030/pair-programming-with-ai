import { describe, expect, it } from 'vitest';
import { PairOrchestrator } from './pairOrchestrator';

describe('pair orchestrator', () => {
  it('does not prepare or apply edits until approvals', async () => {
    const calls: string[] = [];
    const model = {
      requestPlan: async () => ({ summary: 'S', steps: ['A'] }),
      requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [{ path: 'a.ts', content: 'x' }] })
    };
    const workspace = { context: async () => '', prepare: async (edits: unknown[]) => { calls.push('prepare'); return edits; }, apply: async () => { calls.push('apply'); } };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal');
    expect(calls).toEqual([]);
    await orchestrator.approvePlan();
    expect(calls).toEqual(['prepare']);
    await orchestrator.approveChunk();
    expect(calls).toEqual(['prepare', 'apply']);
  });
  it('rejecting a chunk never writes it', async () => {
    let writes = 0;
    const model = { requestPlan: async () => ({ summary: 'S', steps: ['A'] }), requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] }) };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => { writes++; } };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal'); await orchestrator.approvePlan(); await orchestrator.rejectChunk();
    expect(writes).toBe(0);
  });

  it('accepts one chapter, applies it once, and advances to the next review', async () => {
    let chunkIndex = 0;
    const applied: unknown[][] = [];
    const model = {
      requestPlan: async () => ({ summary: 'S', steps: ['A', 'B'] }),
      requestChunk: async () => ({ stepIndex: chunkIndex, title: `Chapter ${++chunkIndex}`, explanation: 'E', edits: [{ path: `chapter-${chunkIndex}.ts`, content: 'x' }] })
    };
    const workspace = { context: async () => '', prepare: async (edits: unknown[]) => edits, apply: async (edits: unknown[]) => { applied.push(edits); } };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal'); await orchestrator.approvePlan();

    await orchestrator.approveChunk();

    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual([{ path: 'chapter-1.ts', content: 'x' }]);
    expect(orchestrator.current.phase).toBe('awaitingChunkApproval');
    expect(orchestrator.current.currentStep).toBe(1);
    expect(orchestrator.current.chunk?.title).toBe('Chapter 2');
    expect(orchestrator.snapshot.history.filter(entry => entry.type === 'approval')).toHaveLength(2);
    expect(orchestrator.snapshot.history.filter(entry => entry.type === 'applied')).toHaveLength(1);
  });

  it('rejects without applying or advancing and requests a replacement for the same chapter', async () => {
    const requests: Array<{ stepIndex: number; feedback?: string }> = [];
    let writes = 0;
    const model = {
      requestPlan: async () => ({ summary: 'S', steps: ['A'] }),
      requestChunk: async (_goal: string, _plan: unknown, stepIndex: number, _context: string, feedback?: string) => {
        requests.push({ stepIndex, feedback });
        return { stepIndex, title: feedback ? 'Replacement' : 'Original', explanation: 'E', edits: [] };
      }
    };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => { writes++; } };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal'); await orchestrator.approvePlan();

    await orchestrator.rejectChunk('Use a smaller change');

    expect(writes).toBe(0);
    expect(orchestrator.current.currentStep).toBe(0);
    expect(orchestrator.current.phase).toBe('awaitingChunkApproval');
    expect(orchestrator.current.chunk?.title).toBe('Replacement');
    expect(requests).toEqual([{ stepIndex: 0, feedback: undefined }, { stepIndex: 0, feedback: 'Use a smaller change' }]);
    expect(orchestrator.snapshot.history.filter(entry => entry.type === 'revision')).toHaveLength(1);
    expect(orchestrator.snapshot.history.some(entry => entry.type === 'applied')).toBe(false);
  });

  it('ignores a duplicate accept while the chapter apply is still running', async () => {
    let writes = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const model = { requestPlan: async () => ({ summary: 'S', steps: ['A'] }), requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] }) };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => { writes++; await gate; } };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal'); await orchestrator.approvePlan();

    const first = orchestrator.approveChunk();
    const duplicate = orchestrator.approveChunk();
    await Promise.resolve();
    expect(writes).toBe(1);
    release(); await Promise.all([first, duplicate]);

    expect(orchestrator.current.phase).toBe('completed');
    expect(orchestrator.snapshot.history.filter(entry => entry.title === 'Chunk approved')).toHaveLength(1);
    expect(orchestrator.snapshot.history.filter(entry => entry.type === 'applied')).toHaveLength(1);
  });

  it('ignores duplicate approvals while the next chunk is loading', async () => {
    let chunkRequests = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const model = {
      requestPlan: async () => ({ summary: 'S', steps: ['A'] }),
      requestChunk: async () => { chunkRequests++; await gate; return { stepIndex: 0, title: 'A', explanation: 'E', edits: [] }; }
    };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => {} };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal');
    const first = orchestrator.approvePlan();
    const second = orchestrator.approvePlan();
    await Promise.resolve();
    await Promise.resolve();
    expect(chunkRequests).toBe(1);
    release();
    await Promise.all([first, second]);
    expect(orchestrator.current.phase).toBe('awaitingChunkApproval');
    expect(orchestrator.snapshot.history.filter(entry => entry.type === 'approval')).toHaveLength(1);
  });

  it('stops an in-flight task and ignores its late completion', async () => {
    let finish!: (value: { summary: string; steps: string[] }) => void;
    let cancelled = false;
    const pending = new Promise<{ summary: string; steps: string[] }>(resolve => { finish = resolve; });
    const model = { requestPlan: () => pending, requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] }), cancel: () => { cancelled = true; } };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => {} };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    const running = orchestrator.submitGoal('goal');
    await Promise.resolve();
    orchestrator.stop();
    finish({ summary: 'Late', steps: ['Too late'] });
    await running;
    expect(cancelled).toBe(true);
    expect(orchestrator.current.phase).toBe('paused');
    expect(orchestrator.snapshot.pendingOperation).toEqual({ type: 'plan', goal: 'goal' });
  });

  it('resumes a stopped request exactly once and records a readable timeline', async () => {
    let attempts = 0;
    let finish!: (value: { summary: string; steps: string[] }) => void;
    const first = new Promise<{ summary: string; steps: string[] }>(resolve => { finish = resolve; });
    const model = {
      requestPlan: async () => {
        attempts++;
        if (attempts === 1) return first;
        return { summary: 'Recovered', steps: ['Continue'] };
      },
      requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] }),
      cancel: () => {}
    };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => {} };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {}, { id: () => 'fixed-id', now: () => '2026-11-03T17:00:00.000Z' });
    const running = orchestrator.submitGoal('goal');
    await Promise.resolve();
    orchestrator.stop();
    finish({ summary: 'Late', steps: ['Ignored'] });
    await running;

    await orchestrator.resume();

    expect(attempts).toBe(2);
    expect(orchestrator.current.phase).toBe('awaitingPlanApproval');
    expect(orchestrator.snapshot.history.map(entry => entry.type)).toEqual(['goal', 'pause', 'plan']);
  });

  it('retries the operation that failed instead of only changing phase', async () => {
    let attempts = 0;
    const model = {
      requestPlan: async () => {
        attempts++;
        if (attempts === 1) throw new Error('offline');
        return { summary: 'Back', steps: ['Continue'] };
      },
      requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] })
    };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => {} };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal');
    expect(orchestrator.current.phase).toBe('error');

    await orchestrator.retry();

    expect(attempts).toBe(2);
    expect(orchestrator.current.phase).toBe('awaitingPlanApproval');
  });

  it('turns a provider timeout into a resumable paused session', async () => {
    const model = {
      requestPlan: async () => { throw new Error('openai request timed out'); },
      requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] })
    };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => {} };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});

    await orchestrator.submitGoal('goal');

    expect(orchestrator.current.phase).toBe('paused');
    expect(orchestrator.snapshot.pendingOperation).toEqual({ type: 'plan', goal: 'goal' });
    expect(orchestrator.snapshot.history.at(-1)?.type).toBe('pause');
  });

  it('renders again when a completed model response is added to the timeline', async () => {
    const model = {
      requestPlan: async () => ({ summary: 'Visible plan', steps: ['Continue'] }),
      requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] })
    };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => {} };
    let orchestrator!: PairOrchestrator;
    const renderedHistoryCounts: number[] = [];
    orchestrator = new PairOrchestrator(model as never, workspace as never, () => {
      if (orchestrator) renderedHistoryCounts.push(orchestrator.getHistory().length);
    });

    await orchestrator.submitGoal('goal');

    expect(renderedHistoryCounts.at(-1)).toBe(2);
  });

  it('persists preview source hashes so restart cannot approve a stale overwrite', async () => {
    const model = {
      requestPlan: async () => ({ summary: 'S', steps: ['A'] }),
      requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [{ path: 'a.ts', content: 'new' }] })
    };
    const workspace = {
      context: async () => '',
      prepare: async () => [{ path: 'a.ts', content: 'new', absolutePath: '/workspace/a.ts', currentHash: 'source-hash', currentContent: 'old' }],
      apply: async () => {}
    };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {});
    await orchestrator.submitGoal('goal');
    await orchestrator.approvePlan();

    expect(orchestrator.snapshot.state.chunk?.edits[0].originalHash).toBe('source-hash');
  });

  it('rehydrates prepared edits before resuming an interrupted apply', async () => {
    const initial = {
      version: 1 as const, id: 'saved', title: 'Saved', status: 'paused' as const, updatedAt: '2026-11-03T17:00:00.000Z',
      state: { phase: 'paused' as const, resumePhase: 'applying' as const, currentStep: 0, goal: 'goal', plan: { summary: 'S', steps: ['A'] }, chunk: { stepIndex: 0, title: 'A', explanation: 'E', edits: [{ path: 'a.ts', content: 'new', originalHash: 'old-hash' }] } },
      history: [], pendingOperation: { type: 'apply' as const }
    };
    const applied: unknown[][] = [];
    const model = { requestPlan: async () => ({ summary: 'S', steps: ['A'] }), requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] }) };
    const workspace = { context: async () => '', prepare: async (edits: unknown[]) => edits.map(edit => ({ ...(edit as object), currentHash: 'old-hash', currentContent: 'old', absolutePath: '/workspace/a.ts' })), apply: async (edits: unknown[]) => { applied.push(edits); } };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {}, { initial });

    await orchestrator.restorePrepared();
    await orchestrator.resume();

    expect(applied).toHaveLength(1);
    expect(applied[0]).toHaveLength(1);
  });

  it('persists chunk as the pending operation before requesting the next chapter', async () => {
    let releaseSecond!: () => void;
    let chunkCalls = 0;
    const secondGate = new Promise<void>(resolve => { releaseSecond = resolve; });
    const saved: import('../session/types').PersistedSession[] = [];
    const model = {
      requestPlan: async () => ({ summary: 'S', steps: ['A', 'B'] }),
      requestChunk: async () => { chunkCalls++; if (chunkCalls === 2) await secondGate; return { stepIndex: chunkCalls - 1, title: 'A', explanation: 'E', edits: [] }; }
    };
    const workspace = { context: async () => '', prepare: async () => [], apply: async () => {} };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {}, { persist: session => { saved.push(session); } });
    await orchestrator.submitGoal('goal'); await orchestrator.approvePlan();
    const applying = orchestrator.approveChunk();
    await Promise.resolve(); await Promise.resolve(); await orchestrator.whenPersisted();

    expect(saved.at(-1)?.state.phase).toBe('requestingChunk');
    expect(saved.at(-1)?.pendingOperation).toEqual({ type: 'chunk' });
    releaseSecond(); await applying;
  });

  it('preserves the original preview hash when rehydrating after disk changes', async () => {
    const initial = {
      version: 1 as const, id: 'saved', title: 'Saved', status: 'active' as const, updatedAt: '2026-11-03T17:00:00.000Z',
      state: { phase: 'awaitingChunkApproval' as const, currentStep: 0, goal: 'goal', plan: { summary: 'S', steps: ['A'] }, chunk: { stepIndex: 0, title: 'A', explanation: 'E', edits: [{ path: 'a.ts', content: 'new', originalHash: 'old-hash' }] } }, history: []
    };
    const model = { requestPlan: async () => ({ summary: 'S', steps: ['A'] }), requestChunk: async () => ({ stepIndex: 0, title: 'A', explanation: 'E', edits: [] }) };
    const workspace = { context: async () => '', prepare: async () => [{ path: 'a.ts', content: 'new', originalHash: 'old-hash', currentHash: 'changed-hash', currentContent: 'changed', absolutePath: '/workspace/a.ts' }], apply: async () => {} };
    const orchestrator = new PairOrchestrator(model as never, workspace as never, () => {}, { initial });

    await orchestrator.restorePrepared();

    expect(orchestrator.snapshot.state.chunk?.edits[0].originalHash).toBe('old-hash');
  });
});
