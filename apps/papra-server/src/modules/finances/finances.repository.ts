import type { Database } from '../app/database/database.types';
import type { TransactionClassification } from './finances.constants';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { decrypt, encrypt } from '../shared/crypto/encryption';
import { withPagination } from '../shared/db/pagination';
import { createBankConnectionNotFoundError, createTransactionNotFoundError } from './finances.errors';
import { bankConnectionsTable, classificationRulesTable, transactionsTable } from './finances.table';

function deriveKey(secret: string): Buffer {
  // AUTH_SECRET can be any length; derive a fixed 32-byte key with SHA-256
  return createHash('sha256').update(secret).digest();
}

function encryptApiKey(apiKey: string, secret: string): string {
  const key = deriveKey(secret);
  const encrypted = encrypt({ key, value: Buffer.from(apiKey, 'utf8') });
  return encrypted.toString('base64');
}

function decryptApiKey(encryptedApiKey: string, secret: string): string {
  try {
    const key = deriveKey(secret);
    const decrypted = decrypt({ encryptedValue: Buffer.from(encryptedApiKey, 'base64'), key });
    return decrypted.toString('utf8');
  }
  catch {
    // Value was stored before encryption was introduced — return as-is (plaintext)
    return encryptedApiKey;
  }
}

export type FinancesRepository = ReturnType<typeof createFinancesRepository>;

export function createFinancesRepository({ db, authSecret }: { db: Database; authSecret: string }) {
  return injectArguments(
    {
      createBankConnection,
      getBankConnections,
      getBankConnectionById,
      deleteBankConnection,
      updateBankConnectionSyncTime,
      updateBankConnection,
      upsertTransactions,
      getTransactions,
      getTransactionById,
      updateTransactionClassification,
      getTransactionsCount,
      getClassificationRules,
      createClassificationRule,
      updateClassificationRule,
      deleteClassificationRule,
      getAllActiveBankConnections,
    },
    { db, authSecret },
  );
}

async function getAllActiveBankConnections({ db }: { db: Database }) {
  const connections = await db.select({
    id: bankConnectionsTable.id,
    organizationId: bankConnectionsTable.organizationId,
    provider: bankConnectionsTable.provider,
    name: bankConnectionsTable.name,
  }).from(bankConnectionsTable)
    .where(eq(bankConnectionsTable.isActive, true));

  return { bankConnections: connections };
}

async function createBankConnection({ db, authSecret, bankConnection }: {
  db: Database;
  authSecret: string;
  bankConnection: {
    organizationId: string;
    provider: string;
    name: string;
    apiKey: string;
    providerAccountId?: string;
  };
}) {
  const [result] = await db.insert(bankConnectionsTable).values({
    ...bankConnection,
    apiKey: encryptApiKey(bankConnection.apiKey, authSecret),
  }).returning();
  return { bankConnection: result };
}

async function getBankConnections({ db, organizationId }: { db: Database; organizationId: string }) {
  const connections = await db.select({
    id: bankConnectionsTable.id,
    provider: bankConnectionsTable.provider,
    name: bankConnectionsTable.name,
    isActive: bankConnectionsTable.isActive,
    lastSyncedAt: bankConnectionsTable.lastSyncedAt,
    providerAccountId: bankConnectionsTable.providerAccountId,
    createdAt: bankConnectionsTable.createdAt,
  }).from(bankConnectionsTable)
    .where(eq(bankConnectionsTable.organizationId, organizationId));

  return { bankConnections: connections };
}

async function getBankConnectionById({ db, authSecret, bankConnectionId, organizationId }: {
  db: Database;
  authSecret: string;
  bankConnectionId: string;
  organizationId: string;
}) {
  const [connection] = await db.select().from(bankConnectionsTable)
    .where(and(
      eq(bankConnectionsTable.id, bankConnectionId),
      eq(bankConnectionsTable.organizationId, organizationId),
    ));

  if (!connection) {
    throw createBankConnectionNotFoundError();
  }

  return {
    bankConnection: {
      ...connection,
      apiKey: decryptApiKey(connection.apiKey, authSecret),
    },
  };
}

async function updateBankConnection({ db, authSecret, bankConnectionId, organizationId, name, providerAccountId, apiKey }: {
  db: Database;
  authSecret: string;
  bankConnectionId: string;
  organizationId: string;
  name?: string;
  providerAccountId?: string | null;
  apiKey?: string;
}) {
  const updates: Partial<typeof bankConnectionsTable.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) {
    updates.name = name;
  }
  if (providerAccountId !== undefined) {
    updates.providerAccountId = providerAccountId;
  }
  if (apiKey !== undefined) {
    updates.apiKey = encryptApiKey(apiKey, authSecret);
  }

  const [updated] = await db.update(bankConnectionsTable)
    .set(updates)
    .where(and(
      eq(bankConnectionsTable.id, bankConnectionId),
      eq(bankConnectionsTable.organizationId, organizationId),
    ))
    .returning();

  if (!updated) {
    throw createBankConnectionNotFoundError();
  }

  return { bankConnection: updated };
}

async function deleteBankConnection({ db, bankConnectionId, organizationId }: {
  db: Database;
  bankConnectionId: string;
  organizationId: string;
}) {
  const [deleted] = await db.delete(bankConnectionsTable)
    .where(and(
      eq(bankConnectionsTable.id, bankConnectionId),
      eq(bankConnectionsTable.organizationId, organizationId),
    ))
    .returning();

  if (!deleted) {
    throw createBankConnectionNotFoundError();
  }
}

async function updateBankConnectionSyncTime({ db, bankConnectionId }: {
  db: Database;
  bankConnectionId: string;
}) {
  await db.update(bankConnectionsTable)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(bankConnectionsTable.id, bankConnectionId));
}

async function upsertTransactions({ db, transactions }: {
  db: Database;
  transactions: Array<typeof transactionsTable.$inferInsert>;
}) {
  if (transactions.length === 0) {
    return { insertedCount: 0 };
  }

  const results = await db.insert(transactionsTable)
    .values(transactions)
    .onConflictDoNothing()
    .returning();

  return { insertedCount: results.length };
}

async function getTransactions({ db, organizationId, pageIndex, pageSize, bankConnectionId, classification }: {
  db: Database;
  organizationId: string;
  pageIndex: number;
  pageSize: number;
  bankConnectionId?: string;
  classification?: string;
}) {
  const classificationFilter = classification === '__unclassified__'
    ? isNull(transactionsTable.classification)
    : classification ? eq(transactionsTable.classification, classification) : undefined;

  const query = db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.organizationId, organizationId),
      bankConnectionId ? eq(transactionsTable.bankConnectionId, bankConnectionId) : undefined,
      classificationFilter,
    ))
    .$dynamic();

  const transactions = await withPagination(query, {
    orderByColumn: desc(transactionsTable.date),
    pageIndex,
    pageSize,
  });

  return { transactions };
}

async function getTransactionsCount({ db, organizationId, bankConnectionId, classification }: {
  db: Database;
  organizationId: string;
  bankConnectionId?: string;
  classification?: string;
}) {
  const classificationFilter = classification === '__unclassified__'
    ? isNull(transactionsTable.classification)
    : classification ? eq(transactionsTable.classification, classification) : undefined;

  const [result] = await db.select({ count: sql<number>`count(*)` }).from(transactionsTable)
    .where(and(
      eq(transactionsTable.organizationId, organizationId),
      bankConnectionId ? eq(transactionsTable.bankConnectionId, bankConnectionId) : undefined,
      classificationFilter,
    ));

  return { count: result?.count ?? 0 };
}

async function getTransactionById({ db, transactionId, organizationId }: {
  db: Database;
  transactionId: string;
  organizationId: string;
}) {
  const [transaction] = await db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.id, transactionId),
      eq(transactionsTable.organizationId, organizationId),
    ));

  if (!transaction) {
    throw createTransactionNotFoundError();
  }

  return { transaction };
}

async function updateTransactionClassification({ db, transactionId, organizationId, classification }: {
  db: Database;
  transactionId: string;
  organizationId: string;
  classification: TransactionClassification | null;
}) {
  const [updated] = await db.update(transactionsTable)
    .set({ classification, updatedAt: new Date() })
    .where(and(
      eq(transactionsTable.id, transactionId),
      eq(transactionsTable.organizationId, organizationId),
    ))
    .returning();

  if (!updated) {
    throw createTransactionNotFoundError();
  }

  return { transaction: updated };
}

async function getClassificationRules({ db, organizationId }: {
  db: Database;
  organizationId: string;
}) {
  const rows = await db.select().from(classificationRulesTable)
    .where(eq(classificationRulesTable.organizationId, organizationId))
    .orderBy(desc(classificationRulesTable.priority));

  const rules = rows.map(r => ({
    ...r,
    conditions: JSON.parse(r.conditions as unknown as string) as Array<{ field: string; operator: string; value: string }>,
  }));

  return { rules };
}

async function createClassificationRule({ db, rule }: {
  db: Database;
  rule: {
    organizationId: string;
    name: string;
    classification: string;
    conditions: Array<{ field: string; operator: string; value: string }>;
    conditionMatchMode?: string;
    priority?: number;
  };
}) {
  const [result] = await db.insert(classificationRulesTable).values({
    ...rule,
    conditions: JSON.stringify(rule.conditions),
    conditionMatchMode: rule.conditionMatchMode ?? 'all',
  }).returning();
  if (!result) throw new Error('Failed to insert classification rule');
  return { rule: { ...result, conditions: JSON.parse(result.conditions as unknown as string) } };
}

async function updateClassificationRule({ db, ruleId, organizationId, updates }: {
  db: Database;
  ruleId: string;
  organizationId: string;
  updates: {
    name?: string;
    classification?: string;
    conditions?: Array<{ field: string; operator: string; value: string }>;
    conditionMatchMode?: string;
    priority?: number;
    isActive?: boolean;
  };
}) {
  const dbUpdates: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (updates.conditions) {
    dbUpdates.conditions = JSON.stringify(updates.conditions);
  }
  const [updated] = await db.update(classificationRulesTable)
    .set(dbUpdates)
    .where(and(
      eq(classificationRulesTable.id, ruleId),
      eq(classificationRulesTable.organizationId, organizationId),
    ))
    .returning();
  if (!updated) throw new Error('Classification rule not found');
  return { rule: { ...updated, conditions: JSON.parse(updated.conditions as unknown as string) } };
}

async function deleteClassificationRule({ db, ruleId, organizationId }: {
  db: Database;
  ruleId: string;
  organizationId: string;
}) {
  await db.delete(classificationRulesTable)
    .where(and(
      eq(classificationRulesTable.id, ruleId),
      eq(classificationRulesTable.organizationId, organizationId),
    ));
}
