import { describe, expect, it } from 'vitest';
import { parsePanelMessage } from './panelMessages';

describe('panel messages', () => {
  it('accepts known messages and trims user text', () => {
    expect(parsePanelMessage({ type: 'submitGoal', goal: '  build it ' })).toEqual({ type: 'submitGoal', goal: 'build it' });
    expect(parsePanelMessage({ type: 'approveChunk' })).toEqual({ type: 'approveChunk' });
    expect(parsePanelMessage({ type: 'stop' })).toEqual({ type: 'stop' });
    expect(parsePanelMessage({ type: 'openFile', index: 2 })).toEqual({ type: 'openFile', index: 2 });
    expect(parsePanelMessage({ type: 'sendMessage', message: '  make it smaller ' })).toEqual({ type: 'sendMessage', message: 'make it smaller' });
    expect(parsePanelMessage({ type: 'resume' })).toEqual({ type: 'resume' });
    expect(parsePanelMessage({ type: 'cancelSession' })).toEqual({ type: 'cancelSession' });
  });
  it('rejects empty goals and unknown commands', () => {
    expect(parsePanelMessage({ type: 'submitGoal', goal: ' ' })).toBeUndefined();
    expect(parsePanelMessage({ type: 'sendMessage', message: ' ' })).toBeUndefined();
    expect(parsePanelMessage({ type: 'deleteEverything' })).toBeUndefined();
  });
});
