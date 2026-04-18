import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq } from 'drizzle-orm';
import { aiChatMessagesTable, aiChatSessionsTable } from './ai-assistant.table';

export type AiAssistantRepository = ReturnType<typeof createAiAssistantRepository>;

export function createAiAssistantRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      getChatSessions,
      getChatSessionById,
      createChatSession,
      updateChatSessionTitle,
      deleteChatSession,
      getChatMessages,
      addChatMessage,
      addChatMessages,
      updateChatMessageMetadata,
    },
    { db },
  );
}

async function getChatSessions({ db, organizationId, userId }: {
  db: Database;
  organizationId: string;
  userId: string;
}) {
  const sessions = await db
    .select({
      id: aiChatSessionsTable.id,
      title: aiChatSessionsTable.title,
      model: aiChatSessionsTable.model,
      createdAt: aiChatSessionsTable.createdAt,
      updatedAt: aiChatSessionsTable.updatedAt,
    })
    .from(aiChatSessionsTable)
    .where(and(eq(aiChatSessionsTable.organizationId, organizationId), eq(aiChatSessionsTable.userId, userId)))
    .orderBy(desc(aiChatSessionsTable.updatedAt));

  return { sessions };
}

async function getChatSessionById({ db, sessionId, userId }: {
  db: Database;
  sessionId: string;
  userId: string;
}) {
  const [session] = await db
    .select()
    .from(aiChatSessionsTable)
    .where(and(eq(aiChatSessionsTable.id, sessionId), eq(aiChatSessionsTable.userId, userId)))
    .limit(1);

  return { session };
}

async function createChatSession({ db, organizationId, userId, title, model }: {
  db: Database;
  organizationId: string;
  userId: string;
  title: string;
  model?: string;
}) {
  const [session] = await db.insert(aiChatSessionsTable).values({
    organizationId,
    userId,
    title,
    model: model ?? null,
  }).returning();

  return { session: session! };
}

async function updateChatSessionTitle({ db, sessionId, userId, title }: {
  db: Database;
  sessionId: string;
  userId: string;
  title: string;
}) {
  await db.update(aiChatSessionsTable)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(aiChatSessionsTable.id, sessionId), eq(aiChatSessionsTable.userId, userId)));
}

async function deleteChatSession({ db, sessionId, userId }: {
  db: Database;
  sessionId: string;
  userId: string;
}) {
  await db.delete(aiChatSessionsTable)
    .where(and(eq(aiChatSessionsTable.id, sessionId), eq(aiChatSessionsTable.userId, userId)));
}

async function getChatMessages({ db, sessionId }: {
  db: Database;
  sessionId: string;
}) {
  const messages = await db
    .select({
      id: aiChatMessagesTable.id,
      role: aiChatMessagesTable.role,
      content: aiChatMessagesTable.content,
      metadata: aiChatMessagesTable.metadata,
      createdAt: aiChatMessagesTable.createdAt,
    })
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.sessionId, sessionId))
    .orderBy(aiChatMessagesTable.createdAt);

  return { messages };
}

async function addChatMessage({ db, sessionId, role, content, metadata }: {
  db: Database;
  sessionId: string;
  role: string;
  content: string;
  metadata?: string;
}) {
  const [message] = await db.insert(aiChatMessagesTable).values({
    sessionId,
    role,
    content,
    metadata,
  }).returning();

  await db.update(aiChatSessionsTable)
    .set({ updatedAt: new Date() })
    .where(eq(aiChatSessionsTable.id, sessionId));

  return { message: message! };
}

async function updateChatMessageMetadata({ db, messageId, metadata }: {
  db: Database;
  messageId: string;
  metadata: string;
}) {
  await db.update(aiChatMessagesTable)
    .set({ metadata })
    .where(eq(aiChatMessagesTable.id, messageId));
}

async function addChatMessages({ db, sessionId, messages }: {
  db: Database;
  sessionId: string;
  messages: { role: string; content: string }[];
}) {
  if (messages.length === 0) {
    return;
  }

  await db.insert(aiChatMessagesTable).values(
    messages.map(m => ({
      sessionId,
      role: m.role,
      content: m.content,
    })),
  );

  await db.update(aiChatSessionsTable)
    .set({ updatedAt: new Date() })
    .where(eq(aiChatSessionsTable.id, sessionId));
}
