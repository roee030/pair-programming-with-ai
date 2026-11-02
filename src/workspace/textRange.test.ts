import { describe, expect, it } from 'vitest';
import { documentEnd } from './textRange';

describe('documentEnd', () => {
  it('returns the exact last line and column', () => {
    expect(documentEnd('one\ntwo\nlast')).toEqual({ line: 2, character: 4 });
    expect(documentEnd('')).toEqual({ line: 0, character: 0 });
  });
});
