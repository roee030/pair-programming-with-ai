import { describe, expect, it } from 'vitest';
import { moveFileSelection } from './fileNavigation';

describe('file navigation', () => {
  it('moves within the proposed file list without wrapping', () => {
    expect(moveFileSelection(0, 1, 3)).toBe(1);
    expect(moveFileSelection(2, 1, 3)).toBe(2);
    expect(moveFileSelection(0, -1, 3)).toBe(0);
  });
  it('returns zero for an empty list', () => {
    expect(moveFileSelection(4, 1, 0)).toBe(0);
  });
});
