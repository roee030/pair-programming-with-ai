import type { Chunk, Plan } from '../session/types';
import type { ModelClient } from './modelClient';

/**
 * Builds a fresh provider client from the current settings for every request, so a model or provider
 * changed with "Pair Flow: Choose Model" applies to Retry and Resume without starting a new session.
 */
export class ReloadingModelClient implements ModelClient {
  private active = new Set<ModelClient>();
  constructor(private readonly load: () => Promise<ModelClient>) {}
  requestPlan(goal: string, context: string): Promise<Plan> { return this.run(client => client.requestPlan(goal, context)); }
  requestChunk(goal: string, plan: Plan, stepIndex: number, context: string, feedback?: string): Promise<Chunk> {
    return this.run(client => client.requestChunk(goal, plan, stepIndex, context, feedback));
  }
  cancel(): void { for (const client of this.active) client.cancel?.(); }
  private async run<T>(work: (client: ModelClient) => Promise<T>): Promise<T> {
    const client = await this.load();
    this.active.add(client);
    try { return await work(client); } finally { this.active.delete(client); }
  }
}
