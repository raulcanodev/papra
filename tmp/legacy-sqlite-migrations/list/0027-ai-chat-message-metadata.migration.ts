import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const aiChatMessageMetadataMigration: Migration = {
  name: 'ai-chat-message-metadata',
  description: 'Add metadata column to ai_chat_messages for persisting web sources and tool confirmation states',

  up: async ({ db }) => {
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info("ai_chat_messages")`);
    if (!columns.some(({ name }) => name === 'metadata')) {
      await db.run(sql`
        ALTER TABLE "ai_chat_messages" ADD COLUMN "metadata" text
      `);
    }
  },

  down: async ({ db }) => {
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info("ai_chat_messages")`);
    if (columns.some(({ name }) => name === 'metadata')) {
      await db.run(sql`ALTER TABLE "ai_chat_messages" DROP COLUMN "metadata"`);
    }
  },
};
