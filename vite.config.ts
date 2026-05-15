import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json' with { type: 'json' };
import path from 'node:path';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'chrome120',
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: 'terser',
    terserOptions: { compress: { drop_console: true, drop_debugger: true } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/lib/**'],
      exclude: ['**/*.test.*', '**/__mocks__/**', 'src/lib/types.ts'],
    },
  },
});
