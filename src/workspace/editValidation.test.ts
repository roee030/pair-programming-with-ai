import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { validateEdits } from './editValidation';

describe('edit validation', () => {
  const root = path.resolve('workspace');
  it('accepts text edits inside the workspace', () => {
    expect(validateEdits(root, [{ path: 'src/a.ts', content: 'ok' }])[0].absolutePath).toBe(path.join(root, 'src', 'a.ts'));
  });
  it.each(['../secret', '/tmp/x', 'C:\\secret.txt'])('rejects unsafe path %s', unsafe => {
    expect(() => validateEdits(root, [{ path: unsafe, content: 'x' }])).toThrow(/path/i);
  });
  it('rejects null bytes', () => {
    expect(() => validateEdits(root, [{ path: 'a.txt', content: 'a\0b' }])).toThrow(/binary/i);
  });
});
