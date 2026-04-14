import type { Database } from '../app/database/database.types';
import type { TransactionClassification } from './finances.constants';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, sql } from 'drizzle-orm';
import { withPagination } from '../shared/db/pagination';
import { createBankConnectionNotFoundError, createTransactionNotFoundError } from './finances.errors';
import { bankConnectionsTable, transactionsTable } from './finances.table';

export type FinancesRepository = ReturnType<typeof createFinancesRepository>;

export function createFinancesRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      createBankConnection,
      getBankConnections,
      getBankConnectionById,
      deleteBankConnection,
      updateBankConnectionSyncTime,
      upsertTransactions,
      getTransactions,
      getTransactionById,
      updateTransactionClassification,
      getTransactionsCount,
    },
    { db },
  );
}

async function createBankConnection({ db, bankConnection }: {
  db: Database;
  bankConnection: {
    organizationId: string;
    provider: string;
    name: string;
    apiKey: string;
    providerAccountId?: string;
  };
}) {
  const [result] = await db.insert(bankConnectionsTable).values(bankConnection).returning();
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

async function getBankConnectionById({ db, bankConnectionId, organizationId }: {
  db: Database;
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

  return { bankConnection: connection };
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
  const query = db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.organizationId, organizationId),
      bankConnectionId ? eq(transactionsTable.bankConnectionId, bankConnectionId) : undefined,
      classification ? eq(transactionsTable.classification, classification) : undefined,
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
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(transactionsTable)
    .where(and(
      eq(transactionsTable.organizationId, organizationId),
      bankConnectionId ? eq(transactionsTable.bankConnectionId, bankConnectionId) : undefined,
      classification ? eq(transactionsTable.classification, classification) : undefined,
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
