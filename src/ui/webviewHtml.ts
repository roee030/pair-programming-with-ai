import type { HistoryEntry, SessionState, SessionSummary } from '../session/types';

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

export function renderBody(state: SessionState, selectedFile = 0, history: readonly HistoryEntry[] = [], sessions: readonly SessionSummary[] = [], timeoutSeconds = 120): string {
  const shellStart = `<main><div class="toolbar"><span class="mode-pill"><i></i>Approval mode</span><button class="icon-button" data-command="reset" title="New code story">＋</button></div>`;
  const shellEnd = `</main>`;
  const extras = `${renderSessionList(sessions)}${renderTimeline(history)}`;
  if (state.phase === 'idle') return `<main class="idle-shell"><div class="toolbar"><span class="mode-pill"><i></i>Approval mode</span><button class="icon-button" data-command="reset" title="New code story">＋</button></div>${renderSessionList(sessions)}<section class="empty-stage"><div class="empty-logo"><span></span><span></span><span></span></div><h1>Start a code story</h1><p>Describe the outcome. Pair Flow will find the entry point, map the connected steps, and pause at every chunk.</p></section><section class="composer-wrap"><form class="composer" data-action="goal"><textarea name="goal" rows="3" autofocus placeholder="Ask Pair Flow to build or change something…"></textarea><div class="composer-bar"><div class="composer-hints"><span>⌁ Plan first</span><span>◇ Review each chunk</span></div><button class="send" aria-label="Build the story" title="Build the story">${icon('arrow')}</button></div></form><p class="privacy-line"><span>◆</span> No file changes without approval</p></section></main>`;

  const story = renderStory(state);
  if (state.phase === 'planning' || state.phase === 'requestingChunk' || state.phase === 'applying') {
    const details = state.phase === 'planning'
      ? ['Reading the workspace', 'Finding the entry point and connections']
      : state.phase === 'applying'
        ? ['Applying your approved chunk', 'Checking file freshness before writing']
        : [`Preparing chapter ${state.currentStep + 1}`, 'Connecting it to the code story'];
    return `${shellStart}${extras}${story}<section class="busy-card" aria-live="polite" data-timeout="${timeoutSeconds}"><div class="code-clock"><span>&lt;/&gt;</span><i></i></div><p class="kicker ai">AI is working</p><h2>${escape(details[0])}</h2><p>${escape(details[1])}</p><div class="busy-meta"><span class="spinner"></span><code data-elapsed>0s elapsed · ${timeoutSeconds}s remaining</code></div><button class="stop-task" data-command="stop">Stop and keep session</button><p class="slow-hint">This request pauses automatically at the time limit. Your session stays saved.</p></section>${shellEnd}`;
  }

  if (state.phase === 'awaitingPlanApproval' && state.plan) return `${shellStart}${extras}${story}<section class="decision-card"><div class="status-line"><span class="status-dot amber"></span><span>Your decision</span></div><h2>Does this route tell the right story?</h2><p>${escape(state.plan.summary)}</p></section><footer class="action-dock"><button class="primary wide" data-command="approvePlan">${icon('check')}<span>Approve route</span></button><button class="secondary wide" data-command="reset">Start over</button></footer>${shellEnd}`;

  if (state.phase === 'awaitingChunkApproval' && state.chunk) {
    const files = state.chunk.edits;
    const safeIndex = Math.max(0, Math.min(files.length - 1, selectedFile));
    const fileRows = files.map((edit, index) => `<button class="file-row ${index === safeIndex ? 'selected' : ''}" data-command="openFile" data-index="${index}" ${index === safeIndex ? 'aria-current="true"' : ''}><span class="file-kind ${fileColor(edit.path)}">${fileGlyph(edit.path)}</span><span class="file-info"><strong>${escape(fileName(edit.path))}</strong><code>${escape(edit.path)}</code></span><span class="file-metric">${edit.content.split('\n').length}<small> lines</small></span>${icon('arrow')}</button>`).join('');
    return `${shellStart}${extras}${story}<section class="chapter-card"><div class="chapter-number">Chapter ${state.currentStep + 1}</div><h2>${escape(state.chunk.title)}</h2><p>${escape(state.chunk.explanation)}</p><div class="connection"><span></span><p><strong>Why this comes next</strong><br>${escape(state.plan?.steps[state.currentStep] ?? state.chunk.title)}</p></div></section><section class="working-set"><div class="section-heading"><div><p class="kicker">Review in editor</p><h3>${files.length} proposed ${files.length === 1 ? 'file' : 'files'}</h3></div><code data-file-position>${files.length ? safeIndex + 1 : 0} / ${files.length}</code></div><div class="file-list">${fileRows || '<p class="empty">This chapter contains no file changes.</p>'}</div><div class="file-nav"><button data-command="previousFile" ${safeIndex <= 0 ? 'disabled' : ''}>← Previous</button><button data-command="nextFile" ${safeIndex >= files.length - 1 ? 'disabled' : ''}>Next file →</button></div></section><footer class="action-dock"><form class="message-composer" data-action="message"><textarea name="message" rows="2" placeholder="Ask a question or request a smaller revision…"></textarea><button class="secondary" aria-label="Send revision">Send</button></form><button class="primary wide" data-command="approveChunk">${icon('check')}<span>Apply approved chunk</span></button><button class="danger wide" data-command="rejectChunk">Reject chunk</button><p class="dock-note">Approves this chapter only. The next one will wait for you too.</p></footer>${shellEnd}`;
  }

  if (state.phase === 'paused') return `${shellStart}${extras}${story}<section class="paused-card" aria-live="polite"><p class="kicker">Session paused</p><h2>Your work is saved.</h2><p>Resume the last action when you are ready, or cancel this session.</p><button class="primary wide" data-command="resume">Resume</button><button class="secondary wide" data-command="cancelSession">Cancel session</button></section>${shellEnd}`;

  if (state.phase === 'completed' || state.phase === 'canceled') return `${shellStart}${extras}${story}<section class="complete"><div class="complete-mark">${icon('check')}</div><p class="kicker success">${state.phase === 'completed' ? 'Story complete' : 'Session canceled'}</p><h1>${state.phase === 'completed' ? 'You stayed in control of every change.' : 'Your history is still available.'}</h1><p>${state.phase === 'completed' ? 'The route is finished and every chunk was explicitly approved.' : 'Start a new story whenever you are ready.'}</p><button class="primary" data-command="reset">Start a new story</button></section>${shellEnd}`;

  return `${shellStart}${extras}${story}<section class="error-card">${icon('warning')}<p class="kicker error">Flow paused</p><h2>The current action did not finish.</h2><p>${escape(state.error)}</p><button class="primary" data-command="retry">Try again</button><button class="secondary" data-command="reset">Start over</button></section>${shellEnd}`;
}

function renderTimeline(history: readonly HistoryEntry[]): string {
  if (!history.length) return '';
  const items = history.map(entry => `<li class="timeline-entry role-${entry.role}"><div><strong>${escape(entry.title ?? entry.type)}</strong><time>${escape(new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</time></div>${entry.body ? `<p>${escape(entry.body)}</p>` : ''}</li>`).join('');
  return `<details class="conversation-timeline" open><summary>Conversation <span>${history.length}</span></summary><ol>${items}</ol></details>`;
}

function renderSessionList(sessions: readonly SessionSummary[]): string {
  if (!sessions.length) return '';
  const labels: Record<SessionSummary['status'], string> = { active: 'Active', paused: 'Paused', done: 'Done', canceled: 'Canceled' };
  return `<details class="session-history"><summary>Recent sessions <span>${sessions.length}</span></summary><ul>${sessions.map(session => `<li><span>${escape(session.title)}</span><small class="status-${session.status}">${labels[session.status]}</small></li>`).join('')}</ul></details>`;
}

function renderStory(state: SessionState): string {
  const goal = state.goal ? `<section class="story-entry"><div class="story-node goal-node">${icon('goal')}</div><div><p class="kicker">Entry point</p><h1>${escape(state.goal)}</h1></div></section>` : '';
  if (!state.plan) return goal;
  const steps = state.plan.steps.map((step, index) => {
    const status = index < state.currentStep ? 'done' : index === state.currentStep ? 'active' : 'upcoming';
    const marker = status === 'done' ? icon('check') : `<span>${index + 1}</span>`;
    return `<li class="story-step ${status}" ${status === 'active' ? 'aria-current="step"' : ''}><div class="story-node">${marker}</div><div><small>${status === 'done' ? 'Approved' : status === 'active' ? currentStepLabel(state) : 'Upcoming'}</small><strong>${escape(step)}</strong></div></li>`;
  }).join('');
  return `${goal}<section class="story-map"><div class="map-title"><strong>${escape(storyStatus(state))}</strong><code>${Math.min(state.currentStep + 1, state.plan.steps.length)}/${state.plan.steps.length}</code></div><ol class="story-spine">${steps}</ol></section>`;
}

function currentStepLabel(state: SessionState): string { return state.phase === 'requestingChunk' ? 'Preparing now' : state.phase === 'awaitingChunkApproval' ? 'Waiting for your review' : state.phase === 'applying' ? 'Applying now' : state.phase === 'paused' ? 'Paused here' : state.phase === 'error' ? 'Needs attention' : 'Current chapter'; }
function storyStatus(state: SessionState): string {
  const chapter = Math.min(state.currentStep + 1, state.plan?.steps.length ?? 1);
  if (state.phase === 'requestingChunk') return `Now: preparing chapter ${chapter}`;
  if (state.phase === 'awaitingChunkApproval') return `Now: review chapter ${chapter}`;
  if (state.phase === 'applying') return `Now: applying chapter ${chapter}`;
  if (state.phase === 'paused') return `Paused at chapter ${chapter}`;
  if (state.phase === 'error') return `Chapter ${chapter} needs attention`;
  if (state.phase === 'completed') return 'All chapters approved';
  return 'Plan route';
}

function fileName(path: string): string { return path.split(/[\\/]/).pop() ?? path; }
function extension(path: string): string { return fileName(path).split('.').pop()?.toLowerCase() ?? ''; }
function fileGlyph(path: string): string { return ({ ts: 'TS', tsx: 'TS', js: 'JS', jsx: 'JS', css: '#', json: '{}', md: 'M↓', py: 'PY', cs: 'C#', go: 'GO', rs: 'RS', kt: 'KT', kts: 'KT', java: 'JV' } as Record<string, string>)[extension(path)] ?? '·/'; }
function fileColor(path: string): string { return `kind-${({ ts: 'blue', tsx: 'blue', js: 'yellow', jsx: 'yellow', css: 'violet', json: 'amber', md: 'cyan', py: 'green', cs: 'violet', go: 'cyan', rs: 'orange', kt: 'violet', kts: 'violet', java: 'orange' } as Record<string, string>)[extension(path)] ?? 'neutral'}`; }

export function renderWebviewHtml(nonce: string, cspSource: string, styleUri: string, scriptUri: string, body: string): string {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'"><link rel="stylesheet" href="${styleUri}"></head><body>${body}<script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
