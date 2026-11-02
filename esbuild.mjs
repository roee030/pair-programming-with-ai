import esbuild from 'esbuild';
const watch = process.argv.includes('--watch');
const context = await esbuild.context({ entryPoints: ['src/extension.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/extension.js', external: ['vscode'], sourcemap: true });
if (watch) await context.watch(); else { await context.rebuild(); await context.dispose(); }
