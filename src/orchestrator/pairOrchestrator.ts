import { initialState, transition } from '../session/sessionMachine';
import type { ModelClient } from '../model/modelClient';
import type { WorkspaceAdapter, PreparedEdit } from '../workspace/workspaceAdapter';
import type { SessionState } from '../session/types';

export class PairOrchestrator {
  private state: SessionState = initialState();
  private prepared: PreparedEdit[] = [];
  private inFlight = false;
  private operationVersion = 0;
  constructor(private readonly model: ModelClient, private readonly workspace: WorkspaceAdapter, private readonly render: (state: SessionState) => void) { this.render(this.state); }
  get current(): SessionState { return this.state; }
  private set(event: Parameters<typeof transition>[1]): void { this.state = transition(this.state, event); this.render(this.state); }
  private isCurrent(version: number): boolean { return version === this.operationVersion; }
  private async exclusive(work: (version: number) => Promise<void>): Promise<void> { if (this.inFlight) return; const version = ++this.operationVersion; this.inFlight = true; try { await work(version); } catch (error) { if (this.isCurrent(version)) this.set({ type: 'FAIL', message: error instanceof Error ? error.message : String(error) }); } finally { if (this.isCurrent(version)) this.inFlight = false; } }
  async submitGoal(goal: string): Promise<void> { await this.exclusive(async version => { this.set({ type: 'SUBMIT_GOAL', goal }); const context = await this.workspace.context(); if (!this.isCurrent(version)) return; const plan = await this.model.requestPlan(goal, context); if (this.isCurrent(version)) this.set({ type: 'PLAN_RECEIVED', plan }); }); }
  async approvePlan(): Promise<void> { await this.exclusive(async version => { this.set({ type: 'APPROVE_PLAN' }); await this.requestChunk(version); }); }
  async approveChunk(): Promise<void> { await this.exclusive(async version => { this.set({ type: 'APPROVE_CHUNK' }); await this.workspace.apply(this.prepared); if (!this.isCurrent(version)) return; this.set({ type: 'APPLY_COMPLETE' }); if (this.state.phase === 'requestingChunk') await this.requestChunk(version); }); }
  async rejectChunk(feedback = 'Rejected. Propose a materially different, smaller approach.'): Promise<void> { await this.exclusive(async version => { this.set({ type: 'REJECT_CHUNK' }); await this.requestChunk(version, feedback); }); }
  retry(): void { this.set({ type: 'RETRY' }); }
  stop(): void { this.operationVersion++; this.inFlight = false; this.model.cancel?.(); this.prepared = []; this.state = initialState(); this.render(this.state); }
  reset(): void { this.stop(); }
  getPrepared(): readonly PreparedEdit[] { return this.prepared; }
  private async requestChunk(version: number, feedback?: string): Promise<void> {
    const { goal, plan, currentStep } = this.state;
    if (!goal || !plan) throw new Error('Session is missing its approved plan');
    const context = await this.workspace.context();
    if (!this.isCurrent(version)) return;
    const chunk = await this.model.requestChunk(goal, plan, currentStep, context, feedback);
    if (!this.isCurrent(version)) return;
    this.prepared = await this.workspace.prepare(chunk.edits);
    if (this.isCurrent(version)) this.set({ type: 'CHUNK_RECEIVED', chunk });
  }
}
