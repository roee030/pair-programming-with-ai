export function moveFileSelection(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, current + delta));
}
