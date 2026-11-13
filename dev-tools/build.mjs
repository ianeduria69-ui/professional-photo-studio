import { build } from '/home/claude/professional-photo-studio/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
const P='/home/claude/professional-photo-studio', D='/tmp/claude-0/-home-claude/52139727-53ca-519e-8939-7b375d4f3dbb/scratchpad/dist';
const common = { absWorkingDir: P, bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic', sourcemap: false, logLevel: 'warning',
  alias: { '@imgly/background-removal': P + '/src/image-processing/imglyMissing.ts' }, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'css' } };
await build({ ...common, entryPoints: ['src/main.tsx'], outfile: D + '/assets/app.js' });
await build({ ...common, entryPoints: ['src/image-processing/adjust.worker.ts'], outfile: D + '/assets/adjust.worker.ts' });
fs.writeFileSync(D + '/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/app.css"><title>Professional Photo Studio</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>');
console.log('built');
