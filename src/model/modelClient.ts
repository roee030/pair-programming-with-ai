import type { Chunk, Plan } from '../session/types';

export interface ModelClient {
  requestPlan(goal: string, context: string): Promise<Plan>;
  requestChunk(goal: string, plan: Plan, stepIndex: number, context: string, feedback?: string): Promise<Chunk>;
  cancel?(): void;
}
