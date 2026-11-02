import type { SessionState } from '../session/types';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
const icon = (name: 'spark' | 'goal' | 'check' | 'file' | 'arrow' | 'warning') => {
  const paths = {
    spark: '<path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2Z"/><path d="M5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14Z"/>',
    goal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M15 9l5-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>', file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/>',
    arrow: '<path d="m9 18 6-6-6-6"/>', warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3v.01"/>'
  };
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
};

export function renderBody(state: SessionState, selectedFile = 0): string {
  const shellStart = `<main><div class="brand"><span class="brand-mark">&lt;/&gt;</span><div><strong>Pair Flow</strong><span>Code story</span></div><button class="icon-button" data-command="reset" title="New story">＋</button></div>`;
  const shellEnd = `</main>`;
  if (state.phase === 'idle') return `${shellStart}<section class="welcome"><div class="orb">${icon('spark')}</div><p class="kicker">Your code, your decisions</p><h1>What should we build together?</h1><p class="lead">I’ll map the route, then stop at every small change for your review.</p><form data-action="goal"><textarea name="goal" rows="7" autofocus placeholder="Describe the outcome, bug, or feature…"></textarea><button class="primary wide"><span>Build the story</span>${icon('arrow')}</button></form><div class="promise"><span class="shield">◆</span><p><strong>Approval locked</strong><br>Nothing reaches your files until you approve the chunk.</p></div></section>${shellEnd}`;

  const story = renderStory(state);
  if (state.phase === 'planning' || state.phase === 'requestingChunk' || state.phase === 'applying') {
    const details = state.phase === 'planning'
      ? ['Reading the workspace', 'Finding the entry point and connections']
      : state.phase === 'applying'
        ? ['Applying your approved chunk', 'Checking file freshness before writing']
        : [`Preparing chapter ${state.currentStep + 1}`, 'Connecting it to the code story'];
    return `${shellStart}${story}<section class="busy-card" aria-live="polite"><div class="code-clock"><span>&lt;/&gt;</span><i></i></div><p class="kicker ai">AI is working</p><h2>${escape(details[0])}</h2><p>${escape(details[1])}</p><div class="busy-meta"><span class="spinner"></span><code data-elapsed>0s elapsed</code></div><p class="slow-hint">Complex projects can take a little longer. The request will time out safely instead of hanging forever.</p></section>${shellEnd}`;
  }

  if (state.phase === 'awaitingPlanApproval' && state.plan) return `${shellStart}${story}<section class="decision-card"><div class="status-line"><span class="status-dot amber"></span><span>Your decision</span></div><h2>Does this route tell the right story?</h2><p>${escape(state.plan.summary)}</p></section><footer class="action-dock"><button class="primary wide" data-command="approvePlan">${icon('check')}<span>Approve route</span></button><button class="secondary wide" data-command="reset">Start over</button></footer>${shellEnd}`;

  if (state.phase === 'awaitingChunkApproval' && state.chunk) {
    const files = state.chunk.edits;
    const safeIndex = Math.max(0, Math.min(files.length - 1, selectedFile));
    const fileRows = files.map((edit, index) => `<button class="file-row ${index === safeIndex ? 'selected' : ''}" data-command="openFile" data-index="${index}"><span class="file-kind ${fileColor(edit.path)}">${fileGlyph(edit.path)}</span><span class="file-info"><strong>${escape(fileName(edit.path))}</strong><code>${escape(edit.path)}</code></span><span class="file-metric">${edit.content.split('\n').length}<small> lines</small></span>${icon('arrow')}</button>`).join('');
    return `${shellStart}${story}<section class="chapter-card"><div class="chapter-number">Chapter ${state.currentStep + 1}</div><h2>${escape(state.chunk.title)}</h2><p>${escape(state.chunk.explanation)}</p><div class="connection"><span></span><p><strong>Why this comes next</strong><br>${escape(state.plan?.steps[state.currentStep] ?? state.chunk.title)}</p></div></section><section class="working-set"><div class="section-heading"><div><p class="kicker">Review in editor</p><h3>${files.length} proposed ${files.length === 1 ? 'file' : 'files'}</h3></div><code>${files.length ? safeIndex + 1 : 0} / ${files.length}</code></div><div class="file-list">${fileRows || '<p class="empty">This chapter contains no file changes.</p>'}</div><div class="file-nav"><button data-command="previousFile" ${safeIndex <= 0 ? 'disabled' : ''}>← Previous</button><button data-command="nextFile" ${safeIndex >= files.length - 1 ? 'disabled' : ''}>Next file →</button></div></section><footer class="action-dock"><button class="primary wide" data-command="approveChunk">${icon('check')}<span>Apply approved chunk</span></button><div class="action-grid"><button class="secondary" data-command="revise">Ask / revise</button><button class="danger" data-command="rejectChunk">Reject</button></div><p class="dock-note">Approves this chapter only. The next one will wait for you too.</p></footer>${shellEnd}`;
  }

  if (state.phase === 'completed') return `${shellStart}${story}<section class="complete"><div class="complete-mark">${icon('check')}</div><p class="kicker success">Story complete</p><h1>You stayed in control of every change.</h1><p>The route is finished and every chunk was explicitly approved.</p><button class="primary" data-command="reset">Start a new story</button></section>${shellEnd}`;

  return `${shellStart}${story}<section class="error-card">${icon('warning')}<p class="kicker error">Flow paused</p><h2>The current action did not finish.</h2><p>${escape(state.error)}</p><button class="primary" data-command="retry">Try again</button><button class="secondary" data-command="reset">Start over</button></section>${shellEnd}`;
}

function renderStory(state: SessionState): string {
  const goal = state.goal ? `<section class="story-entry"><div class="story-node goal-node">${icon('goal')}</div><div><p class="kicker">Entry point</p><h1>${escape(state.goal)}</h1></div></section>` : '';
  if (!state.plan) return goal;
  const steps = state.plan.steps.map((step, index) => {
    const status = index < state.currentStep ? 'done' : index === state.currentStep ? 'active' : 'upcoming';
    const marker = status === 'done' ? icon('check') : `<span>${index + 1}</span>`;
    return `<li class="story-step ${status}"><div class="story-node">${marker}</div><div><small>${status === 'done' ? 'Approved' : status === 'active' ? 'Current chapter' : 'Upcoming'}</small><strong>${escape(step)}</strong></div></li>`;
  }).join('');
  return `${goal}<section class="story-map"><div class="map-title"><span>Code story</span><code>${Math.min(state.currentStep + 1, state.plan.steps.length)}/${state.plan.steps.length}</code></div><ol class="story-spine">${steps}</ol></section>`;
}

function fileName(path: string): string { return path.split(/[\\/]/).pop() ?? path; }
function extension(path: string): string { return fileName(path).split('.').pop()?.toLowerCase() ?? ''; }
function fileGlyph(path: string): string { return ({ ts: 'TS', tsx: 'TS', js: 'JS', jsx: 'JS', css: '#', json: '{}', md: 'M↓', py: 'PY', cs: 'C#', go: 'GO', rs: 'RS' } as Record<string, string>)[extension(path)] ?? '·/'; }
function fileColor(path: string): string { return `kind-${({ ts: 'blue', tsx: 'blue', js: 'yellow', jsx: 'yellow', css: 'violet', json: 'amber', md: 'cyan', py: 'green', cs: 'violet', go: 'cyan', rs: 'orange' } as Record<string, string>)[extension(path)] ?? 'neutral'}`; }

export function renderWebviewHtml(nonce: string, styleUri: string, scriptUri: string, body: string): string {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${styleUri}; script-src 'nonce-${nonce}'"><link rel="stylesheet" href="${styleUri}"></head><body>${body}<script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
