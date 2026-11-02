import { describe, expect, it } from 'vitest';
import { initialState, transition } from './sessionMachine';

describe('session machine', () => {
  it('requires plan approval before requesting a chunk', () => {
    let state = transition(initialState(), { type: 'SUBMIT_GOAL', goal: 'Add login' });
    state = transition(state, { type: 'PLAN_RECEIVED', plan: { summary: 'Add login', steps: ['Add route'] } });
    expect(state.phase).toBe('awaitingPlanApproval');
    expect(() => transition(state, { type: 'CHUNK_RECEIVED', chunk: sampleChunk() })).toThrow(/plan/i);
  });

  it('never enters applying without explicit chunk approval', () => {
    let state = approvedPlanState();
    state = transition(state, { type: 'CHUNK_RECEIVED', chunk: sampleChunk() });
    expect(state.phase).toBe('awaitingChunkApproval');
    expect(transition(state, { type: 'REJECT_CHUNK' }).phase).toBe('requestingChunk');
    expect(transition(state, { type: 'APPROVE_CHUNK' }).phase).toBe('applying');
  });

  it('preserves the prior phase when an operation fails', () => {
    const state = approvedPlanState();
    const failed = transition(state, { type: 'FAIL', message: 'offline' });
    expect(failed.phase).toBe('error');
    expect(failed.resumePhase).toBe('requestingChunk');
    expect(transition(failed, { type: 'RETRY' }).phase).toBe('requestingChunk');
  });
});

function approvedPlanState() {
  let state = transition(initialState(), { type: 'SUBMIT_GOAL', goal: 'Add login' });
  state = transition(state, { type: 'PLAN_RECEIVED', plan: { summary: 'Add login', steps: ['Add route'] } });
  return transition(state, { type: 'APPROVE_PLAN' });
}
function sampleChunk() { return { stepIndex: 0, title: 'Add route', explanation: 'Adds route', edits: [{ path: 'src/a.ts', content: 'export {}' }] }; }
