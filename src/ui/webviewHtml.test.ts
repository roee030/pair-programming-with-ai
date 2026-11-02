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
});
