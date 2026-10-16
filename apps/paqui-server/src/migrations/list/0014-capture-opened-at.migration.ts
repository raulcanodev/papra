import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const captureOpenedAtMigration = {
  name: 'capture-opened-at',
  description: 'When the phone opened the capture link: from then on the computer waits for its photos instead of showing the QR code',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "capture_sessions" ADD COLUMN IF NOT EXISTS "opened_at" timestamp (3) with time zone`));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "capture_sessions" DROP COLUMN IF EXISTS "opened_at"`));
  },
} satisfies Migration;
