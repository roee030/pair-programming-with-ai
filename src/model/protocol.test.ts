import { describe, expect, it } from 'vitest';
import { parseChunkResponse, parsePlanResponse } from './protocol';

describe('model protocol', () => {
  it('parses a fenced plan response', () => {
    expect(parsePlanResponse('```json\n{"summary":"S","steps":["A"]}\n```').steps).toEqual(['A']);
  });
  it('rejects malformed and oversized chunks', () => {
    expect(() => parsePlanResponse('nope')).toThrow(/JSON/);
    const edits = [1,2,3,4].map(i => ({ path: `a${i}.ts`, content: '' }));
    expect(() => parseChunkResponse(JSON.stringify({ stepIndex: 0, title: 'x', explanation: 'x', edits }))).toThrow(/three/i);
  });
  it('rejects missing chunk fields', () => {
    expect(() => parseChunkResponse('{}')).toThrow(/chunk/i);
  });
});
