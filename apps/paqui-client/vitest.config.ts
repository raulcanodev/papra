import path from 'node:path';
import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';
import { entityIconSetPlugin } from './src/modules/ui/icons/entity-icon-set.vite-plugin';

export default defineConfig({
  // Compiles the JSX of component tests (*.test.tsx)
  plugins: [solidPlugin(), entityIconSetPlugin()],
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
