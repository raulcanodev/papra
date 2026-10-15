import path from 'node:path';
import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles the JSX of component tests (*.test.tsx)
  plugins: [solidPlugin()],
  test: {
    isolate: false,
    env: {
      TZ: 'UTC',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
