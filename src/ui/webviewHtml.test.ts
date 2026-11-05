import { describe, expect, it } from 'vitest';
import { renderBody, renderWebviewHtml } from './webviewHtml';
import type { HistoryEntry, SessionSummary } from '../session/types';

describe('webview', () => {
  it('uses a nonce CSP and escapes session content', () => {
    const html = renderWebviewHtml('nonce123', 'vscode-webview://origin', 'style.css', 'main.js', renderBody({ phase: 'error', error: '<script>x</script>' } as never));
    expect(html).toContain("script-src 'nonce-nonce123'");
    expect(html).toContain('style-src vscode-webview://origin');
    expect(html).not.toContain('<script>x</script>');
  });
  it('only shows approval controls while awaiting a decision', () => {
    expect(renderBody({ phase: 'awaitingPlanApproval', plan: { summary: 'S', steps: ['A'] } } as never)).toContain('approvePlan');
    expect(renderBody({ phase: 'planning', goal: 'x' } as never)).not.toContain('approvePlan');
  });
  it('renders the goal as the story entry point and connected chapters', () => {
    const html = renderBody({ phase: 'awaitingPlanApproval', goal: 'Build auth', currentStep: 0, plan: { summary: 'Secure login', steps: ['Add route', 'Add tests'] } } as never);
    expect(html).toContain('story-entry');
    expect(html).toContain('Build auth');
    expect(html).toContain('story-spine');
    expect(html).toContain('Add route');
  });
  it('renders an explicit code-clock loader for slow operations', () => {
    const html = renderBody({ phase: 'requestingChunk', goal: 'Build auth', currentStep: 0, plan: { summary: 'S', steps: ['Add route'] } } as never);
    expect(html).toContain('code-clock');
    expect(html).toContain('Preparing chapter 1');
    expect(html).toContain('data-elapsed');
    expect(html).toContain('data-command="stop"');
  });
  it('renders selectable files and bounded navigation controls', () => {
    const html = renderBody({ phase: 'awaitingChunkApproval', currentStep: 0, plan: { summary: 'S', steps: ['A'] }, chunk: { stepIndex: 0, title: 'A', explanation: 'E', edits: [{ path: 'src/a.ts', content: 'one\ntwo' }, { path: 'src/b.css', content: 'x' }] } } as never, 1);
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('2 / 2');
    expect(html).toContain('Apply approved chunk');
  });
  it('colors story progress from the actual number of completed chapters', () => {
    const html = renderBody({ phase: 'requestingChunk', goal: 'Build auth', currentStep: 1, plan: { summary: 'S', steps: ['A', 'B', 'C'] } } as never);
    expect(html).toContain('story-step done');
    expect(html).toContain('Now: preparing chapter 2');
    expect(html).not.toContain('style="');
  });

  it('renders escaped conversation history and compact session summaries', () => {
    const history: HistoryEntry[] = [{ id: '1', timestamp: '2026-11-03T17:00:00.000Z', role: 'user', type: 'goal', title: 'Goal', body: '<img src=x onerror=alert(1)>' }];
    const sessions: SessionSummary[] = [{ id: '1', title: 'Build history', status: 'done', updatedAt: '2026-11-03T17:00:00.000Z' }];
    const html = renderBody({ phase: 'awaitingPlanApproval', currentStep: 0, plan: { summary: 'S', steps: ['A'] } } as never, 0, history, sessions);
    expect(html).toContain('conversation-timeline');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Build history');
    expect(html).toContain('Done');
  });

  it('renders resume and cancel controls for paused work', () => {
    const html = renderBody({ phase: 'paused', goal: 'Build auth', currentStep: 0, resumePhase: 'planning' } as never);
    expect(html).toContain('data-command="resume"');
    expect(html).toContain('data-command="cancelSession"');
  });

  it('renders an in-panel revision composer at the chunk decision boundary', () => {
    const html = renderBody({ phase: 'awaitingChunkApproval', currentStep: 0, plan: { summary: 'S', steps: ['A'] }, chunk: { stepIndex: 0, title: 'A', explanation: 'E', edits: [] } } as never);
    expect(html).toContain('data-action="message"');
    expect(html).toContain('name="message"');
  });

  it('offers Resume for sessions the user left, and never for the current one', () => {
    const sessions: SessionSummary[] = [
      { id: 'left', title: 'Add login', status: 'active', updatedAt: '2026-11-03T17:00:00.000Z' },
      { id: 'here', title: 'Current work', status: 'active', updatedAt: '2026-11-03T18:00:00.000Z' },
      { id: 'old', title: 'Finished', status: 'done', updatedAt: '2026-11-03T16:00:00.000Z' }
    ];
    const idle = renderBody({ phase: 'idle', currentStep: 0 } as never, 0, [], sessions, 120, { canResumeSessions: true });
    expect(idle).toContain('Pick up where you left off');
    expect(idle).toContain('data-command="openSession" data-session-id="left"');
    expect(idle).not.toContain('data-session-id="old"');
    const busy = renderBody({ phase: 'awaitingPlanApproval', currentStep: 0, plan: { summary: 'S', steps: ['A'] } } as never, 0, [], sessions, 120, { canResumeSessions: true, currentSessionId: 'here' });
    expect(busy).toContain('data-session-id="left"');
    expect(busy).not.toContain('data-command="openSession" data-session-id="here"');
    expect(busy).toContain('Current');
  });

  it('hides Resume and model buttons for hosts that do not handle them yet', () => {
    const sessions: SessionSummary[] = [{ id: 'left', title: 'Add login', status: 'paused', updatedAt: '2026-11-03T17:00:00.000Z' }];
    expect(renderBody({ phase: 'idle', currentStep: 0 } as never, 0, [], sessions)).not.toContain('openSession');
    expect(renderBody({ phase: 'error', currentStep: 0, error: 'x Run "Pair Flow: Choose Model" to pick another model.' } as never)).not.toContain('chooseModel');
  });

  it('shows provider errors in a wrapping block with a Choose model button for model errors', () => {
    const error = 'OpenAI request failed (400): invalid model ID: gtp 5 mini\n\nThe model "gtp 5 mini" is not available for OpenAI. Did you mean "gpt-5-mini"? Run "Pair Flow: Choose Model" to pick another model.';
    const html = renderBody({ phase: 'error', currentStep: 0, error } as never, 0, [], [], 120, { canChooseModel: true });
    expect(html).toContain('<pre class="error-detail">');
    expect(html).toContain('<button class="primary" data-command="chooseModel">Choose model</button>');
    expect(html).toContain('data-command="retry"');
    const other = renderBody({ phase: 'error', currentStep: 0, error: 'network down' } as never, 0, [], [], 120, { canChooseModel: true });
    expect(other).toContain('<button class="primary" data-command="retry">');
    expect(other).toContain('Change model');
  });
});
