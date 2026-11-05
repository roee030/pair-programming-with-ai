// Bundles the shared panel UI (renderer + main.js + main.css) for the JetBrains plugin.
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? join(root, 'jetbrains', 'plugin', 'build', 'generated', 'webview-resources', 'webview');
mkdirSync(out, { recursive: true });
await esbuild.build({ entryPoints: [join(root, 'src', 'ui', 'browserEntry.ts')], bundle: true, platform: 'browser', format: 'iife', target: 'chrome110', outfile: join(out, 'pair-flow-ui.js') });
copyFileSync(join(root, 'media', 'main.js'), join(out, 'main.js'));
copyFileSync(join(root, 'media', 'main.css'), join(out, 'main.css'));
console.log(`JetBrains webview assets written to ${out}`);
