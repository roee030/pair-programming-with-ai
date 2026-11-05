const vscode = acquireVsCodeApi();

document.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.dataset.action === 'message') {
    vscode.postMessage({ type: 'sendMessage', message: data.get('message') });
    lock(event.submitter, 'Sending…');
  } else {
    vscode.postMessage({ type: 'submitGoal', goal: data.get('goal') });
    lock(event.submitter, 'Mapping…');
  }
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-command]');
  if (!button || button.disabled) return;
  const message = { type: button.dataset.command };
  if (button.dataset.index !== undefined) message.index = Number(button.dataset.index);
  if (button.dataset.sessionId !== undefined) message.id = button.dataset.sessionId;
  vscode.postMessage(message);
  if (['approvePlan', 'approveChunk', 'rejectChunk'].includes(message.type)) lock(button, message.type === 'approvePlan' ? 'Preparing…' : 'Working…');
});

window.addEventListener('message', event => {
  const message = event.data;
  if (!message || message.type !== 'fileSelection') return;
  const rows = [...document.querySelectorAll('.file-row')];
  rows.forEach((row, index) => {
    const selected = index === message.index;
    row.classList.toggle('selected', selected);
    if (selected) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
  });
  const position = document.querySelector('[data-file-position]');
  if (position) position.textContent = `${message.count ? message.index + 1 : 0} / ${message.count}`;
  const previous = document.querySelector('[data-command="previousFile"]');
  const next = document.querySelector('[data-command="nextFile"]');
  if (previous) previous.disabled = message.index <= 0;
  if (next) next.disabled = message.index >= message.count - 1;
});

let elapsedTimer;
function startElapsedTimer() {
  clearInterval(elapsedTimer);
  const started = Date.now();
  const elapsed = document.querySelector('[data-elapsed]');
  if (!elapsed) return;
  const timeout = Number(document.querySelector('[data-timeout]')?.dataset.timeout || 120);
  const update = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    elapsed.textContent = `${seconds}s elapsed · ${Math.max(0, timeout - seconds)}s remaining`;
  };
  update(); elapsedTimer = setInterval(update, 1000);
}
startElapsedTimer();
// Hosts that re-render the body in place (the JetBrains plugin) call this after each render.
window.pairFlowAfterRender = startElapsedTimer;

function lock(button, text) {
  if (!button) return;
  button.disabled = true;
  button.classList.add('is-loading');
  const label = button.querySelector('span');
  if (label) label.textContent = text; else button.textContent = text;
}
