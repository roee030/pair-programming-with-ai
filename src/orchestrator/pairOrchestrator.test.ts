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
});
