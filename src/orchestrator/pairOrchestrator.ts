import { initialState, transition } from '../session/sessionMachine';
import type { ModelClient } from '../model/modelClient';
import type { WorkspaceAdapter, PreparedEdit } from '../workspace/workspaceAdapter';
import type { SessionState } from '../session/types';

export class PairOrchestrator {
  private state: SessionState = initialState();
  private prepared: PreparedEdit[] = [];
  private inFlight = false;
  constructor(private readonly model: ModelClient, private readonly workspace: WorkspaceAdapter, private readonly render: (state: SessionState) => void) { this.render(this.state); }
  get current(): SessionState { return this.state; }
  private set(event: Parameters<typeof transition>[1]): void { this.state = transition(this.state, event); this.render(this.state); }
  private async safe(work: () => Promise<void>): Promise<void> { try { await work(); } catch (error) { this.set({ type: 'FAIL', message: error instanceof Error ? error.message : String(error) }); } }
  private async exclusive(work: () => Promise<void>): Promise<void> { if (this.inFlight) return; this.inFlight = true; try { await this.safe(work); } finally { this.inFlight = false; } }
  async submitGoal(goal: string): Promise<void> { await this.exclusive(async () => { this.set({ type: 'SUBMIT_GOAL', goal }); const context = await this.workspace.context(); this.set({ type: 'PLAN_RECEIVED', plan: await this.model.requestPlan(goal, context) }); }); }
  async approvePlan(): Promise<void> { await this.exclusive(async () => { this.set({ type: 'APPROVE_PLAN' }); await this.requestChunk(); }); }
  async approveChunk(): Promise<void> { await this.exclusive(async () => { this.set({ type: 'APPROVE_CHUNK' }); await this.workspace.apply(this.prepared); this.set({ type: 'APPLY_COMPLETE' }); if (this.state.phase === 'requestingChunk') await this.requestChunk(); }); }
  async rejectChunk(feedback = 'Rejected. Propose a materially different, smaller approach.'): Promise<void> { await this.exclusive(async () => { this.set({ type: 'REJECT_CHUNK' }); await this.requestChunk(feedback); }); }
  retry(): void { this.set({ type: 'RETRY' }); }
  reset(): void { this.prepared = []; this.set({ type: 'RESET' }); }
  getPrepared(): readonly PreparedEdit[] { return this.prepared; }
  private async requestChunk(feedback?: string): Promise<void> {
    const { goal, plan, currentStep } = this.state;
    if (!goal || !plan) throw new Error('Session is missing its approved plan');
    const context = await this.workspace.context();
    const chunk = await this.model.requestChunk(goal, plan, currentStep, context, feedback);
    this.prepared = await this.workspace.prepare(chunk.edits);
    this.set({ type: 'CHUNK_RECEIVED', chunk });
  }
}
