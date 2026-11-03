import type { SessionEvent, SessionState } from './types';

export function initialState(): SessionState { return { phase: 'idle', currentStep: 0 }; }

export function transition(state: SessionState, event: SessionEvent): SessionState {
  if (event.type === 'RESET') return initialState();
  if (event.type === 'PAUSE' && isPausable(state.phase)) return { ...state, phase: 'paused', resumePhase: state.phase };
  if (event.type === 'CANCEL' && state.phase !== 'completed') return { ...state, phase: 'canceled', error: undefined, resumePhase: undefined };
  if (event.type === 'RESUME' && state.phase === 'paused' && state.resumePhase) return { ...state, phase: state.resumePhase, error: undefined };
  if (event.type === 'FAIL' && state.phase !== 'error') return { ...state, phase: 'error', error: event.message, resumePhase: state.phase };
  if (event.type === 'RETRY' && state.phase === 'error' && state.resumePhase) return { ...state, phase: state.resumePhase, error: undefined, resumePhase: undefined };
  switch (state.phase) {
    case 'idle':
      if (event.type === 'SUBMIT_GOAL' && event.goal.trim()) return { ...state, phase: 'planning', goal: event.goal.trim() };
      break;
    case 'planning':
      if (event.type === 'PLAN_RECEIVED') return { ...state, phase: 'awaitingPlanApproval', plan: event.plan };
      break;
    case 'awaitingPlanApproval':
      if (event.type === 'APPROVE_PLAN') return { ...state, phase: 'requestingChunk' };
      if (event.type === 'CHUNK_RECEIVED') throw new Error('Plan must be approved before a chunk can be accepted');
      break;
    case 'requestingChunk':
      if (event.type === 'CHUNK_RECEIVED') return { ...state, phase: 'awaitingChunkApproval', chunk: event.chunk };
      break;
    case 'awaitingChunkApproval':
      if (event.type === 'APPROVE_CHUNK') return { ...state, phase: 'applying' };
      if (event.type === 'REJECT_CHUNK') return { ...state, phase: 'requestingChunk', chunk: undefined };
      break;
    case 'applying':
      if (event.type === 'APPLY_COMPLETE') {
        const next = state.currentStep + 1;
        return { ...state, currentStep: next, chunk: undefined, phase: next >= (state.plan?.steps.length ?? 0) ? 'completed' : 'requestingChunk' };
      }
      break;
  }
  throw new Error(`Event ${event.type} is not allowed while ${state.phase}`);
}

function isPausable(phase: SessionState['phase']): phase is 'planning' | 'requestingChunk' | 'applying' {
  return phase === 'planning' || phase === 'requestingChunk' || phase === 'applying';
}
