import { describe, expect, it } from 'vitest';
import { renderBody, renderWebviewHtml } from './webviewHtml';

describe('webview', () => {
  it('uses a nonce CSP and escapes session content', () => {
    const html = renderWebviewHtml('nonce123', 'style.css', 'main.js', renderBody({ phase: 'error', error: '<script>x</script>' } as never));
    expect(html).toContain("script-src 'nonce-nonce123'");
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
  });
  it('renders selectable files and bounded navigation controls', () => {
    const html = renderBody({ phase: 'awaitingChunkApproval', currentStep: 0, plan: { summary: 'S', steps: ['A'] }, chunk: { stepIndex: 0, title: 'A', explanation: 'E', edits: [{ path: 'src/a.ts', content: 'one\ntwo' }, { path: 'src/b.css', content: 'x' }] } } as never, 1);
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('2 / 2');
    expect(html).toContain('Apply approved chunk');
  });
});
