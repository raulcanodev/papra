import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const aiChatMessageMetadataMigration: Migration = {
  name: 'ai-chat-message-metadata',
  description: 'Add metadata column to ai_chat_messages for persisting web sources and tool confirmation states',

  up: async ({ db }) => {
    await db.run(sql`
      ALTER TABLE "ai_chat_messages" ADD COLUMN "metadata" text
    `);
  },

  down: async ({ db }) => {
    // SQLite does not support DROP COLUMN in all versions; migration is non-reversible
    await db.run(sql`SELECT 1`);
  },
};
