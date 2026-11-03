import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { decidePreparedApply, validateEdits } from './editValidation';

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
  it('treats content already written before a restart as safely applied', () => {
    expect(decidePreparedApply('new', 'new', 'new-hash', 'old-hash', 'old-hash')).toBe('already-applied');
  });
  it('still rejects a changed file whose content is not the approved proposal', () => {
    expect(() => decidePreparedApply('someone else changed it', 'new', 'changed-hash', 'old-hash', 'old-hash')).toThrow(/changed since preview/i);
  });
});
