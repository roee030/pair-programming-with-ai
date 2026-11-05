export type PanelMessage =
  | { type: 'submitGoal'; goal: string }
  | { type: 'sendMessage'; message: string }
  | { type: 'openFile'; index: number }
  | { type: 'openSession' | 'discardSession'; id: string }
  | { type: 'approvePlan' | 'approveChunk' | 'rejectChunk' | 'previousFile' | 'nextFile' | 'retry' | 'resume' | 'cancelSession' | 'reset' | 'stop' | 'chooseModel' };

export function parsePanelMessage(value: unknown): PanelMessage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === 'submitGoal' && typeof message.goal === 'string' && message.goal.trim()) return { type: 'submitGoal', goal: message.goal.trim() };
  if (message.type === 'sendMessage' && typeof message.message === 'string' && message.message.trim()) return { type: 'sendMessage', message: message.message.trim() };
  if (message.type === 'openFile' && Number.isInteger(message.index) && Number(message.index) >= 0) return { type: 'openFile', index: Number(message.index) };
  if ((message.type === 'openSession' || message.type === 'discardSession') && typeof message.id === 'string' && /^[\w.-]{1,80}$/.test(message.id)) return { type: message.type, id: message.id };
  if (['approvePlan', 'approveChunk', 'rejectChunk', 'previousFile', 'nextFile', 'retry', 'resume', 'cancelSession', 'reset', 'stop', 'chooseModel'].includes(String(message.type))) return { type: message.type } as PanelMessage;
  return undefined;
}
