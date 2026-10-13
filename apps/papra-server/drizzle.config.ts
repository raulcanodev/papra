import { env } from 'node:process';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/modules/**/*.table.ts', './src/modules/**/*.tables.ts'],
  dialect: 'postgresql',
  out: './src/migrations',
  dbCredentials: {
    url: env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/papra',
  },
});
