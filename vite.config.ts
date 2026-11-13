import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The AI background-removal package is an OPTIONAL dependency. If it is not
 * installed, alias it to a small stub that throws a clear "not installed"
 * error at runtime, so the rest of the app still builds and runs.
 */
const imglyInstalled = existsSync(path.join(root, 'node_modules', '@imgly', 'background-removal', 'package.json'));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: imglyInstalled
      ? {}
      : { '@imgly/background-removal': path.join(root, 'src/image-processing/imglyMissing.ts') },
  },
  optimizeDeps: { exclude: ['@imgly/background-removal'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
