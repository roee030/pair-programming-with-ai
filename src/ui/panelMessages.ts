export type PanelMessage =
  | { type: 'submitGoal'; goal: string }
  | { type: 'approvePlan' | 'approveChunk' | 'rejectChunk' | 'revise' | 'preview' | 'retry' | 'reset' };

export function parsePanelMessage(value: unknown): PanelMessage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === 'submitGoal' && typeof message.goal === 'string' && message.goal.trim()) return { type: 'submitGoal', goal: message.goal.trim() };
  if (['approvePlan', 'approveChunk', 'rejectChunk', 'revise', 'preview', 'retry', 'reset'].includes(String(message.type))) return { type: message.type } as PanelMessage;
  return undefined;
}
