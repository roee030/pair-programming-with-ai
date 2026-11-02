import path from 'node:path';
import type { ProposedEdit } from '../session/types';

export type ValidatedEdit = ProposedEdit & { absolutePath: string };
export function validateEdits(root: string, edits: ProposedEdit[]): ValidatedEdit[] {
  const resolvedRoot = path.resolve(root);
  return edits.map(edit => {
    if (!edit.path || path.isAbsolute(edit.path) || /^[A-Za-z]:[\\/]/.test(edit.path)) throw new Error(`Unsafe path: ${edit.path}`);
    const absolutePath = path.resolve(resolvedRoot, edit.path);
    const relative = path.relative(resolvedRoot, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Path escapes workspace: ${edit.path}`);
    if (edit.content.includes('\0')) throw new Error(`Binary content is not supported: ${edit.path}`);
    return { ...edit, absolutePath };
  });
}
