const vscode = acquireVsCodeApi();

document.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.target);
  vscode.postMessage({ type: 'submitGoal', goal: data.get('goal') });
  lock(event.submitter, 'Mapping…');
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-command]');
  if (!button || button.disabled) return;
  const message = { type: button.dataset.command };
  if (button.dataset.index !== undefined) message.index = Number(button.dataset.index);
  vscode.postMessage(message);
  if (['approvePlan', 'approveChunk', 'rejectChunk'].includes(message.type)) lock(button, message.type === 'approvePlan' ? 'Preparing…' : 'Working…');
});

const started = Date.now();
const elapsed = document.querySelector('[data-elapsed]');
if (elapsed) {
  const update = () => { elapsed.textContent = `${Math.floor((Date.now() - started) / 1000)}s elapsed`; };
  update(); setInterval(update, 1000);
}

function lock(button, text) {
  if (!button) return;
  button.disabled = true;
  button.classList.add('is-loading');
  const label = button.querySelector('span');
  if (label) label.textContent = text; else button.textContent = text;
}
