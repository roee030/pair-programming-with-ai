export type Plan = { summary: string; steps: string[] };
export type ProposedEdit = { path: string; content: string; originalHash?: string };
export type Chunk = { stepIndex: number; title: string; explanation: string; edits: ProposedEdit[]; verification?: string };

export type Phase = 'idle' | 'planning' | 'awaitingPlanApproval' | 'requestingChunk' | 'awaitingChunkApproval' | 'applying' | 'completed' | 'error';
export type SessionState = {
  phase: Phase; goal?: string; plan?: Plan; chunk?: Chunk; currentStep: number;
  error?: string; resumePhase?: Exclude<Phase, 'error'>;
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
  | { type: 'RESET' };
