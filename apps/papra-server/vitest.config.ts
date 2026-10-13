import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false,
    // Each test database is an in-memory PostgreSQL (PGlite, wasm) which takes ~1s to boot
    testTimeout: 20_000,
    env: {
      TZ: 'UTC',
    },
  },
});
