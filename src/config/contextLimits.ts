export function clampMaxContextFiles(value: number | undefined): number {
  return Math.max(1, Math.min(30, value ?? 12));
}
