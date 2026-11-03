import { initialState, transition } from '../session/sessionMachine';
import type { ModelClient } from '../model/modelClient';
import type { WorkspaceAdapter, PreparedEdit } from '../workspace/workspaceAdapter';
import type { HistoryEntry, PendingOperation, PersistedSession, SessionState, SessionStatus } from '../session/types';

type OrchestratorOptions = { initial?: PersistedSession; persist?: (session: PersistedSession) => void | Promise<void>; now?: () => string; id?: () => string };

export class PairOrchestrator {
  private state: SessionState;
  private prepared: PreparedEdit[] = [];
  private inFlight = false;
  private operationVersion = 0;
  private history: HistoryEntry[];
  private pendingOperation?: PendingOperation;
  private readonly sessionId: string;
  private readonly now: () => string;
  private readonly makeId: () => string;
  private persistChain = Promise.resolve();

  constructor(private readonly model: ModelClient, private readonly workspace: WorkspaceAdapter, private readonly render: (state: SessionState) => void, private readonly options: OrchestratorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.makeId = options.id ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`);
    this.sessionId = options.initial?.id ?? this.makeId();
    this.state = options.initial?.state ?? initialState();
    this.history = [...(options.initial?.history ?? [])];
    this.pendingOperation = options.initial?.pendingOperation;
    this.render(this.state);
  }

  get current(): SessionState { return this.state; }
  get snapshot(): PersistedSession {
    const state = this.state.chunk && this.prepared.length === this.state.chunk.edits.length
      ? { ...this.state, chunk: { ...this.state.chunk, edits: this.state.chunk.edits.map((edit, index) => ({ ...edit, originalHash: edit.originalHash ?? this.prepared[index].currentHash })) } }
      : this.state;
    return { version: 1, id: this.sessionId, title: this.state.goal?.slice(0, 80) || 'Untitled session', status: statusFor(this.state.phase), updatedAt: this.now(), state, history: [...this.history], pendingOperation: this.pendingOperation };
  }
  getPrepared(): readonly PreparedEdit[] { return this.prepared; }
  getHistory(): readonly HistoryEntry[] { return this.history; }
  async whenPersisted(): Promise<void> { await this.persistChain; }

  async restorePrepared(): Promise<void> {
    const needsPrepared = this.state.phase === 'awaitingChunkApproval' || this.pendingOperation?.type === 'apply';
    if (needsPrepared && this.state.chunk) { this.prepared = await this.workspace.prepare(this.state.chunk.edits); this.render(this.state); }
  }

  async submitGoal(goal: string): Promise<void> {
    if (this.inFlight) return;
    this.pendingOperation = { type: 'plan', goal };
    this.addHistory('user', 'goal', 'Goal', goal);
    await this.exclusive(async version => { this.set({ type: 'SUBMIT_GOAL', goal }); await this.runPlan(version, goal); });
  }
  async approvePlan(): Promise<void> {
    if (this.inFlight) return;
    this.pendingOperation = { type: 'chunk' };
    this.addHistory('user', 'approval', 'Plan approved', this.state.plan?.summary);
    await this.exclusive(async version => { this.set({ type: 'APPROVE_PLAN' }); await this.requestChunk(version); });
  }
  async approveChunk(): Promise<void> {
    if (this.inFlight) return;
    this.pendingOperation = { type: 'apply' };
    this.addHistory('user', 'approval', 'Chunk approved', this.state.chunk?.title, this.state.currentStep);
    await this.exclusive(async version => { this.set({ type: 'APPROVE_CHUNK' }); await this.applyAndAdvance(version); });
  }
  async rejectChunk(feedback = 'Rejected. Propose a materially different, smaller approach.'): Promise<void> {
    if (this.inFlight) return;
    this.pendingOperation = { type: 'chunk', feedback };
    this.addHistory('user', 'revision', 'Revision requested', feedback, this.state.currentStep);
    await this.exclusive(async version => { this.set({ type: 'REJECT_CHUNK' }); await this.requestChunk(version, feedback); });
  }
  stop(): void {
    if (!['planning', 'requestingChunk', 'applying'].includes(this.state.phase)) return;
    this.operationVersion++; this.inFlight = false; this.model.cancel?.();
    this.set({ type: 'PAUSE' });
    this.addHistory('system', 'pause', 'Work paused', 'The active request was stopped.');
    this.save();
  }
  async resume(): Promise<void> { if (this.state.phase !== 'paused' || !this.pendingOperation) return; this.set({ type: 'RESUME' }); await this.runPending(); }
  async retry(): Promise<void> { if (this.state.phase !== 'error' || !this.pendingOperation) return; this.set({ type: 'RETRY' }); await this.runPending(); }
  cancel(): void {
    if (this.inFlight) this.model.cancel?.();
    this.operationVersion++; this.inFlight = false; this.pendingOperation = undefined;
    this.set({ type: 'CANCEL' }); this.addHistory('system', 'pause', 'Session canceled'); this.save();
  }
  reset(): void {
    this.operationVersion++; this.inFlight = false; this.model.cancel?.(); this.prepared = []; this.pendingOperation = undefined; this.history = [];
    this.state = initialState(); this.render(this.state);
  }

  private async runPending(): Promise<void> {
    const operation = this.pendingOperation;
    if (!operation) return;
    await this.exclusive(async version => {
      if (operation.type === 'plan') await this.runPlan(version, operation.goal);
      else if (operation.type === 'chunk') await this.requestChunk(version, operation.feedback);
      else await this.applyAndAdvance(version);
    });
  }
  private async runPlan(version: number, goal: string): Promise<void> {
    const context = await this.workspace.context(); if (!this.isCurrent(version)) return;
    const plan = await this.model.requestPlan(goal, context); if (!this.isCurrent(version)) return;
    this.pendingOperation = undefined; this.set({ type: 'PLAN_RECEIVED', plan });
    this.addHistory('assistant', 'plan', 'Plan', `${plan.summary}\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`); this.save();
  }
  private async requestChunk(version: number, feedback?: string): Promise<void> {
    const { goal, plan, currentStep } = this.state;
    if (!goal || !plan) throw new Error('Session is missing its approved plan');
    const context = await this.workspace.context(); if (!this.isCurrent(version)) return;
    const chunk = await this.model.requestChunk(goal, plan, currentStep, context, feedback); if (!this.isCurrent(version)) return;
    this.prepared = await this.workspace.prepare(chunk.edits); if (!this.isCurrent(version)) return;
    this.pendingOperation = undefined; this.set({ type: 'CHUNK_RECEIVED', chunk });
    this.addHistory('assistant', 'explanation', chunk.title, chunk.explanation, currentStep); this.save();
  }
  private async applyAndAdvance(version: number): Promise<void> {
    await this.workspace.apply(this.prepared); if (!this.isCurrent(version)) return;
    this.addHistory('system', 'applied', 'Chunk applied', this.state.chunk?.title, this.state.currentStep);
    const hasNext = this.state.currentStep + 1 < (this.state.plan?.steps.length ?? 0);
    this.pendingOperation = hasNext ? { type: 'chunk' } : undefined;
    this.set({ type: 'APPLY_COMPLETE' });
    if (this.state.phase === 'requestingChunk') { await this.requestChunk(version); }
    else { this.pendingOperation = undefined; this.addHistory('system', 'completion', 'Story complete'); this.save(); }
  }
  private async exclusive(work: (version: number) => Promise<void>): Promise<void> {
    if (this.inFlight) return;
    const version = ++this.operationVersion; this.inFlight = true;
    try { await work(version); }
    catch (error) {
      if (this.isCurrent(version)) {
        const message = error instanceof Error ? error.message : String(error);
        if (/request timed out$/i.test(message)) {
          this.set({ type: 'PAUSE' });
          this.addHistory('system', 'pause', 'Request timed out', 'The session is saved and can be resumed.');
        } else {
          this.set({ type: 'FAIL', message });
          this.addHistory('system', 'error', 'Action failed', message);
        }
        this.save();
      }
    }
    finally { if (this.isCurrent(version)) this.inFlight = false; }
  }
  private set(event: Parameters<typeof transition>[1]): void { this.state = transition(this.state, event); this.render(this.state); this.save(); }
  private isCurrent(version: number): boolean { return version === this.operationVersion; }
  private addHistory(role: HistoryEntry['role'], type: HistoryEntry['type'], title?: string, body?: string, stepIndex?: number): void {
    this.history.push({ id: this.makeId(), timestamp: this.now(), role, type, title, body, stepIndex });
    this.render(this.state);
  }
  private save(): void {
    if (!this.options.persist) return;
    const snapshot = this.snapshot;
    this.persistChain = this.persistChain.catch(() => undefined).then(() => this.options.persist?.(snapshot)).then(() => undefined);
  }
}

function statusFor(phase: SessionState['phase']): SessionStatus { if (phase === 'paused') return 'paused'; if (phase === 'completed') return 'done'; if (phase === 'canceled') return 'canceled'; return 'active'; }
