import { describe, expect, it } from 'vitest';
import { clampMaxContextFiles } from './contextLimits';

describe('context file limit', () => {
  it.each([
    [undefined, 12],
    [0, 1],
    [8, 8],
    [99, 30]
  ])('clamps %s to %s', (value, expected) => {
    expect(clampMaxContextFiles(value)).toBe(expected);
  });
});
