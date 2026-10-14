import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    isolate: false,
    reporters: ['verbose'],
    projects: ['apps/*/vitest.config.ts', 'packages/*/vitest.config.ts'],
    coverage: {
      include: ['packages/*/src'],
    },
    env: {
      TZ: 'UTC',
    },
  },
})
