import type { Chunk, Plan } from '../session/types';

function json(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { throw new Error('Model returned invalid JSON'); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object');
  return value as Record<string, unknown>;
}
export function parsePlanResponse(text: string): Plan {
  const value = object(json(text));
  if (typeof value.summary !== 'string' || !Array.isArray(value.steps) || value.steps.length === 0 || !value.steps.every(s => typeof s === 'string')) throw new Error('Invalid plan response');
  return { summary: value.summary, steps: value.steps as string[] };
}
export function parseChunkResponse(text: string): Chunk {
  const value = object(json(text));
  if (typeof value.stepIndex !== 'number' || typeof value.title !== 'string' || typeof value.explanation !== 'string' || !Array.isArray(value.edits)) throw new Error('Invalid chunk response');
  if (value.edits.length > 3) throw new Error('A chunk cannot edit more than three files');
  const edits = value.edits.map(item => {
    const edit = object(item);
    if (typeof edit.path !== 'string' || typeof edit.content !== 'string') throw new Error('Invalid chunk edit');
    return { path: edit.path, content: edit.content, originalHash: typeof edit.originalHash === 'string' ? edit.originalHash : undefined };
  });
  return { stepIndex: value.stepIndex, title: value.title, explanation: value.explanation, edits, verification: typeof value.verification === 'string' ? value.verification : undefined };
}
