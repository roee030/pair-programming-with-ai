import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['node_modules/@vscode/vsce/vsce', 'ls'], { encoding: 'utf8', shell: false });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || String(result.error ?? 'vsce ls failed'));
  process.exit(result.status ?? 1);
}

const actual = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).sort();
const allowed = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'dist/extension.js',
  'media/main.css',
  'media/main.js',
  'media/pair-flow.png',
  'media/pair-flow.svg',
  'package.json'
].sort();

const missing = allowed.filter(file => !actual.includes(file));
const unexpected = actual.filter(file => !allowed.includes(file));
if (missing.length || unexpected.length) {
  if (missing.length) console.error(`Missing VSIX files:\n${missing.join('\n')}`);
  if (unexpected.length) console.error(`Unexpected VSIX files:\n${unexpected.join('\n')}`);
  process.exit(1);
}

console.log(`VSIX inventory verified (${actual.length} files).`);
