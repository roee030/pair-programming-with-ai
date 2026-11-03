export type Plan = { summary: string; steps: string[] };
export type ProposedEdit = { path: string; content: string; originalHash?: string };
export type Chunk = { stepIndex: number; title: string; explanation: string; edits: ProposedEdit[]; verification?: string };

export type SessionStatus = 'active' | 'paused' | 'done' | 'canceled';
export type HistoryRole = 'user' | 'assistant' | 'system';
export type HistoryType = 'goal' | 'message' | 'plan' | 'explanation' | 'revision' | 'approval' | 'applied' | 'pause' | 'error' | 'completion';
export type HistoryEntry = {
  id: string; timestamp: string; role: HistoryRole; type: HistoryType;
  title?: string; body?: string; stepIndex?: number;
};
export type PendingOperation =
  | { type: 'plan'; goal: string }
  | { type: 'chunk'; feedback?: string }
  | { type: 'apply' };

export type Phase = 'idle' | 'planning' | 'awaitingPlanApproval' | 'requestingChunk' | 'awaitingChunkApproval' | 'applying' | 'paused' | 'completed' | 'canceled' | 'error';
export type SessionState = {
  phase: Phase; goal?: string; plan?: Plan; chunk?: Chunk; currentStep: number;
  error?: string; resumePhase?: Exclude<Phase, 'error'>;
};

export type SessionSummary = { id: string; title: string; status: SessionStatus; updatedAt: string };
export type PersistedSession = {
  version: 1; id: string; title: string; status: SessionStatus; updatedAt: string;
  state: SessionState; history: HistoryEntry[]; pendingOperation?: PendingOperation;
};

export type SessionEvent =
  | { type: 'SUBMIT_GOAL'; goal: string }
  | { type: 'PLAN_RECEIVED'; plan: Plan }
  | { type: 'APPROVE_PLAN' }
  | { type: 'CHUNK_RECEIVED'; chunk: Chunk }
  | { type: 'APPROVE_CHUNK' }
  | { type: 'REJECT_CHUNK' }
  | { type: 'APPLY_COMPLETE' }
  | { type: 'FAIL'; message: string }
  | { type: 'RETRY' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'CANCEL' }
  | { type: 'RESET' };
