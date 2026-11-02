export type TextEnd = { line: number; character: number };

export function documentEnd(text: string): TextEnd {
  const lines = text.split(/\r?\n/);
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
