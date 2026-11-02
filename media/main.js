const vscode = acquireVsCodeApi();
document.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.target); vscode.postMessage({ type: 'submitGoal', goal: data.get('goal') }); });
document.addEventListener('click', event => { const button = event.target.closest('[data-command]'); if (button) vscode.postMessage({ type: button.dataset.command }); });
