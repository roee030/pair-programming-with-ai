import { parseChunkResponse, parsePlanResponse } from './protocol';
import type { Chunk, Plan } from '../session/types';

export class OpenAICompatibleClient {
  constructor(private readonly options: { baseUrl: string; model: string; apiKey: string; fetch?: typeof fetch }) {}
  private async complete(messages: { role: string; content: string }[]): Promise<string> {
    if (!this.options.apiKey) throw new Error('Set your Pair Flow API key first');
    const response = await (this.options.fetch ?? fetch)(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({ model: this.options.model, messages, response_format: { type: 'json_object' } })
    });
    if (!response.ok) throw new Error(`Model request failed (${response.status})`);
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Model returned an empty response');
    return content;
  }
  async requestPlan(goal: string, context: string): Promise<Plan> {
    return parsePlanResponse(await this.complete([{ role: 'system', content: PLAN_PROMPT }, { role: 'user', content: `Goal:\n${goal}\n\nWorkspace:\n${context}` }]));
  }
  async requestChunk(goal: string, plan: Plan, stepIndex: number, context: string, feedback?: string): Promise<Chunk> {
    return parseChunkResponse(await this.complete([{ role: 'system', content: CHUNK_PROMPT }, { role: 'user', content: JSON.stringify({ goal, plan, stepIndex, context, feedback }) }]));
  }
}
const PLAN_PROMPT = `You are a careful pair programmer. Return JSON only: {"summary":"what we will do","steps":["small step"]}. Each step must be independently understandable and reviewable. Do not write code.`;
const CHUNK_PROMPT = `Return JSON only: {"stepIndex":0,"title":"","explanation":"","edits":[{"path":"relative/path","content":"complete new file content"}],"verification":"optional safe command"}. One coherent change, at most 3 text files. Never use absolute paths.`;
