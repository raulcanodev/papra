import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { AI_CHAT_MESSAGE_ID_PREFIX, AI_CHAT_SESSION_ID_PREFIX } from './ai-assistant.constants';

export const aiChatSessionsTable = sqliteTable('ai_chat_sessions', {
  ...createPrimaryKeyField({ prefix: AI_CHAT_SESSION_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('New chat'),
  model: text('model'),
}, t => [
  index('ai_chat_sessions_organization_id_index').on(t.organizationId),
  index('ai_chat_sessions_user_id_index').on(t.userId),
]);

export const aiChatMessagesTable = sqliteTable('ai_chat_messages', {
  ...createPrimaryKeyField({ prefix: AI_CHAT_MESSAGE_ID_PREFIX }),
  ...createTimestampColumns(),

  sessionId: text('session_id').notNull().references(() => aiChatSessionsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  metadata: text('metadata'), // JSON: { webSources?, toolConfirmations? }
}, t => [
  index('ai_chat_messages_session_id_index').on(t.sessionId),
]);
