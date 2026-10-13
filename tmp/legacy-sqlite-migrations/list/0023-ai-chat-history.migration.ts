import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const aiChatHistoryMigration: Migration = {
  name: 'ai-chat-history',
  description: 'Add tables for AI chat session history',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "ai_chat_sessions" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "user_id" text NOT NULL,
          "title" text NOT NULL DEFAULT 'New chat',
          "model" text
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "ai_chat_sessions_organization_id_index"
        ON "ai_chat_sessions" ("organization_id")
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "ai_chat_sessions_user_id_index"
        ON "ai_chat_sessions" ("user_id")
      `),
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "session_id" text NOT NULL REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "role" text NOT NULL,
          "content" text NOT NULL
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "ai_chat_messages_session_id_index"
        ON "ai_chat_messages" ("session_id")
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "ai_chat_messages"`),
      db.run(sql`DROP TABLE IF EXISTS "ai_chat_sessions"`),
    ]);
  },
};
