import type { Database } from '../app/database/database.types';
import type { TransactionClassification } from './finances.constants';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, gt, gte, isNull, like, lt, lte, or, sql } from 'drizzle-orm';
import { decrypt, encrypt } from '../shared/crypto/encryption';
import { withPagination } from '../shared/db/pagination';
import { createBankConnectionNotFoundError, createTransactionNotFoundError } from './finances.errors';
import { bankConnectionsTable, classificationRulesTable, financeGoalBucketsTable, financeGoalVersionsTable, financeGoalsTable, subscriptionsTable, transactionsTable } from './finances.table';

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
  } catch {
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
      updateBankConnectionBalance,
      upsertTransactions,
      getTransactions,
      getTransactionById,
      updateTransactionClassification,
      getTransactionsCount,
      getTransactionsTotalAmount,
      getClassificationRules,
      createClassificationRule,
      updateClassificationRule,
      deleteClassificationRule,
      getAllActiveBankConnections,
      getOverviewStats,
      getSubscriptions,
      createSubscription,
      updateSubscription,
      deleteSubscription,
      searchTransactionsAggregate,
      getSpendingBreakdown,
      getAccountBalances,
      getUnclassifiedCounterpartySummary,
      getFinanceGoal,
      getOrCreateFinanceGoal,
      updateFinanceGoal,
      getFinanceGoalBuckets,
      createFinanceGoalBucket,
      updateFinanceGoalBucket,
      deleteFinanceGoalBucket,
      snapshotGoalVersion,
      listGoalVersions,
      restoreGoalVersion,
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
  }).from(bankConnectionsTable).where(eq(bankConnectionsTable.isActive, true));

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
    cachedBalance: bankConnectionsTable.cachedBalance,
    balanceCurrency: bankConnectionsTable.balanceCurrency,
    lastBalanceFetchedAt: bankConnectionsTable.lastBalanceFetchedAt,
  }).from(bankConnectionsTable).where(eq(bankConnectionsTable.organizationId, organizationId));

  return { bankConnections: connections };
}

async function getBankConnectionById({ db, authSecret, bankConnectionId, organizationId }: {
  db: Database;
  authSecret: string;
  bankConnectionId: string;
  organizationId: string;
}) {
  const [connection] = await db.select().from(bankConnectionsTable).where(and(
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

async function updateBankConnectionBalance({ db, bankConnectionId, balance, currency }: {
  db: Database;
  bankConnectionId: string;
  balance: number;
  currency: string;
}) {
  await db.update(bankConnectionsTable)
    .set({ cachedBalance: balance, balanceCurrency: currency, lastBalanceFetchedAt: new Date(), updatedAt: new Date() })
    .where(eq(bankConnectionsTable.id, bankConnectionId));
}

async function getAccountBalances({ db, organizationId }: {
  db: Database;
  organizationId: string;
}) {
  const connections = await db.select({
    id: bankConnectionsTable.id,
    name: bankConnectionsTable.name,
    provider: bankConnectionsTable.provider,
    cachedBalance: bankConnectionsTable.cachedBalance,
    balanceCurrency: bankConnectionsTable.balanceCurrency,
    lastBalanceFetchedAt: bankConnectionsTable.lastBalanceFetchedAt,
  }).from(bankConnectionsTable).where(and(
    eq(bankConnectionsTable.organizationId, organizationId),
    eq(bankConnectionsTable.isActive, true),
  ));

  return {
    balances: connections
      .filter(c => c.cachedBalance !== null)
      .map(c => ({
        bankConnectionId: c.id,
        bankConnectionName: c.name,
        provider: c.provider,
        balance: c.cachedBalance!,
        currency: c.balanceCurrency!,
        lastFetchedAt: c.lastBalanceFetchedAt,
      })),
  };
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

function buildAmountFilter(amountFilter?: string, amountValue?: number) {
  if (!amountFilter || amountValue == null) {
    if (amountFilter === 'positive') return gt(transactionsTable.amount, 0);
    if (amountFilter === 'negative') return lt(transactionsTable.amount, 0);
    return undefined;
  }
  switch (amountFilter) {
    case 'gt': return gt(transactionsTable.amount, amountValue);
    case 'lt': return lt(transactionsTable.amount, amountValue);
    case 'gte': return gte(transactionsTable.amount, amountValue);
    case 'lte': return lte(transactionsTable.amount, amountValue);
    case 'eq': return eq(transactionsTable.amount, amountValue);
    case 'positive': return gt(transactionsTable.amount, 0);
    case 'negative': return lt(transactionsTable.amount, 0);
    default: return undefined;
  }
}

function buildSearchFilter(search?: string) {
  if (!search || search.trim().length === 0) return undefined;
  const term = `%${search.trim()}%`;
  return or(
    like(transactionsTable.description, term),
    like(transactionsTable.counterparty, term),
  );
}

function buildDateFilter(dateFrom?: number, dateTo?: number) {
  const filters = [];
  if (dateFrom != null) filters.push(gte(transactionsTable.date, new Date(dateFrom)));
  if (dateTo != null) filters.push(lte(transactionsTable.date, new Date(dateTo)));
  return filters.length > 0 ? and(...filters) : undefined;
}

async function getTransactions({ db, organizationId, pageIndex, pageSize, bankConnectionId, classification, search, amountFilter, amountValue, dateFrom, dateTo }: {
  db: Database;
  organizationId: string;
  pageIndex: number;
  pageSize: number;
  bankConnectionId?: string;
  classification?: string;
  search?: string;
  amountFilter?: string;
  amountValue?: number;
  dateFrom?: number;
  dateTo?: number;
}) {
  const classificationFilter = classification === '__unclassified__'
    ? isNull(transactionsTable.classification)
    : classification ? eq(transactionsTable.classification, classification) : undefined;

  const query = db.select().from(transactionsTable).where(and(
    eq(transactionsTable.organizationId, organizationId),
    bankConnectionId ? eq(transactionsTable.bankConnectionId, bankConnectionId) : undefined,
    classificationFilter,
    buildSearchFilter(search),
    buildAmountFilter(amountFilter, amountValue),
    buildDateFilter(dateFrom, dateTo),
  )).$dynamic();

  const transactions = await withPagination(query, {
    orderByColumn: desc(transactionsTable.date),
    pageIndex,
    pageSize,
  });

  return { transactions };
}

async function getTransactionsCount({ db, organizationId, bankConnectionId, classification, search, amountFilter, amountValue, dateFrom, dateTo }: {
  db: Database;
  organizationId: string;
  bankConnectionId?: string;
  classification?: string;
  search?: string;
  amountFilter?: string;
  amountValue?: number;
  dateFrom?: number;
  dateTo?: number;
}) {
  const classificationFilter = classification === '__unclassified__'
    ? isNull(transactionsTable.classification)
    : classification ? eq(transactionsTable.classification, classification) : undefined;

  const [result] = await db.select({ count: sql<number>`count(*)` }).from(transactionsTable).where(and(
    eq(transactionsTable.organizationId, organizationId),
    bankConnectionId ? eq(transactionsTable.bankConnectionId, bankConnectionId) : undefined,
    classificationFilter,
    buildSearchFilter(search),
    buildAmountFilter(amountFilter, amountValue),
    buildDateFilter(dateFrom, dateTo),
  ));

  return { count: result?.count ?? 0 };
}

async function getTransactionsTotalAmount({ db, organizationId, bankConnectionId, classification, search, amountFilter, amountValue, dateFrom, dateTo }: {
  db: Database;
  organizationId: string;
  bankConnectionId?: string;
  classification?: string;
  search?: string;
  amountFilter?: string;
  amountValue?: number;
  dateFrom?: number;
  dateTo?: number;
}) {
  const classificationFilter = classification === '__unclassified__'
    ? isNull(transactionsTable.classification)
    : classification ? eq(transactionsTable.classification, classification) : undefined;

  const [result] = await db.select({ totalAmount: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` }).from(transactionsTable).where(and(
    eq(transactionsTable.organizationId, organizationId),
    bankConnectionId ? eq(transactionsTable.bankConnectionId, bankConnectionId) : undefined,
    classificationFilter,
    buildSearchFilter(search),
    buildAmountFilter(amountFilter, amountValue),
    buildDateFilter(dateFrom, dateTo),
  ));

  return { totalAmount: Number(result?.totalAmount ?? 0) };
}

async function getTransactionById({ db, transactionId, organizationId }: {
  db: Database;
  transactionId: string;
  organizationId: string;
}) {
  const [transaction] = await db.select().from(transactionsTable).where(and(
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
  const rows = await db.select().from(classificationRulesTable).where(eq(classificationRulesTable.organizationId, organizationId)).orderBy(desc(classificationRulesTable.priority));

  const rules = rows.map(r => ({
    ...r,
    conditions: JSON.parse(r.conditions as unknown as string) as Array<{ field: string; operator: string; value: string }>,
    tagIds: JSON.parse(r.tagIds as unknown as string) as string[],
  }));

  return { rules };
}

async function createClassificationRule({ db, rule }: {
  db: Database;
  rule: {
    organizationId: string;
    name: string;
    classification?: string;
    conditions: Array<{ field: string; operator: string; value: string }>;
    conditionMatchMode?: string;
    tagIds?: string[];
    priority?: number;
  };
}) {
  if (rule.priority === undefined || rule.priority === 0) {
    const defaultQuery = await db.select({ maxPriority: sql<number>`max(${classificationRulesTable.priority})` })
      .from(classificationRulesTable)
      .where(and(
        eq(classificationRulesTable.organizationId, rule.organizationId),
        rule.classification != null ? eq(classificationRulesTable.classification, rule.classification) : undefined,
      ));
    rule.priority = (defaultQuery[0]?.maxPriority ?? 0) + 10;
  }

  const [result] = await db.insert(classificationRulesTable).values({
    ...rule,
    conditions: JSON.stringify(rule.conditions),
    conditionMatchMode: rule.conditionMatchMode ?? 'all',
    tagIds: JSON.stringify(rule.tagIds ?? []),
  }).returning();
  if (!result) {
    throw new Error('Failed to insert classification rule');
  }
  return { rule: { ...result, conditions: JSON.parse(result.conditions as unknown as string), tagIds: JSON.parse(result.tagIds as unknown as string) } };
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
    tagIds?: string[];
    priority?: number;
    isActive?: boolean;
  };
}) {
  const dbUpdates: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (updates.conditions) {
    dbUpdates.conditions = JSON.stringify(updates.conditions);
  }
  if (updates.tagIds) {
    dbUpdates.tagIds = JSON.stringify(updates.tagIds);
  }
  const [updated] = await db.update(classificationRulesTable)
    .set(dbUpdates)
    .where(and(
      eq(classificationRulesTable.id, ruleId),
      eq(classificationRulesTable.organizationId, organizationId),
    ))
    .returning();
  if (!updated) {
    throw new Error('Classification rule not found');
  }
  return { rule: { ...updated, conditions: JSON.parse(updated.conditions as unknown as string), tagIds: JSON.parse(updated.tagIds as unknown as string) } };
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

async function getOverviewStats({ db, organizationId }: {
  db: Database;
  organizationId: string;
}) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [monthlySummary, classificationBreakdown, unclassifiedResult] = await Promise.all([
    db.select({
      month: sql<string>`strftime('%Y-%m', datetime(${transactionsTable.date} / 1000, 'unixepoch'))`,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.amount} > 0 AND (${transactionsTable.classification} IS NULL OR ${transactionsTable.classification} NOT IN ('internal_transfer', 'owner_transfer')) THEN ${transactionsTable.amount} ELSE 0 END), 0)`,
      expenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.amount} < 0 AND (${transactionsTable.classification} IS NULL OR ${transactionsTable.classification} NOT IN ('internal_transfer', 'owner_transfer')) THEN ABS(${transactionsTable.amount}) ELSE 0 END), 0)`,
    }).from(transactionsTable).where(and(
      eq(transactionsTable.organizationId, organizationId),
      gte(transactionsTable.date, sixMonthsAgo),
    )).groupBy(sql`strftime('%Y-%m', datetime(${transactionsTable.date} / 1000, 'unixepoch'))`).orderBy(sql`strftime('%Y-%m', datetime(${transactionsTable.date} / 1000, 'unixepoch'))`),

    db.select({
      classification: transactionsTable.classification,
      total: sql<number>`COALESCE(SUM(ABS(${transactionsTable.amount})), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(transactionsTable).where(and(
      eq(transactionsTable.organizationId, organizationId),
      gte(transactionsTable.date, sixMonthsAgo),
    )).groupBy(transactionsTable.classification).orderBy(desc(sql`SUM(ABS(${transactionsTable.amount}))`)),

    db.select({ count: sql<number>`COUNT(*)` }).from(transactionsTable).where(and(
      eq(transactionsTable.organizationId, organizationId),
      isNull(transactionsTable.classification),
    )),
  ]);

  return {
    monthlySummary,
    classificationBreakdown,
    unclassifiedCount: unclassifiedResult[0]?.count ?? 0,
  };
}

async function getSubscriptions({ db, organizationId }: {
  db: Database;
  organizationId: string;
}) {
  const subscriptions = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, organizationId)).orderBy(desc(subscriptionsTable.createdAt));
  return { subscriptions };
}

async function createSubscription({ db, subscription }: {
  db: Database;
  subscription: {
    organizationId: string;
    name: string;
    amount: number;
    currency: string;
    billingCycle: string;
    nextPaymentAt?: Date | null;
    category?: string | null;
    notes?: string | null;
  };
}) {
  const [result] = await db.insert(subscriptionsTable).values(subscription).returning();
  return { subscription: result! };
}

async function updateSubscription({ db, subscriptionId, organizationId, updates }: {
  db: Database;
  subscriptionId: string;
  organizationId: string;
  updates: {
    name?: string;
    amount?: number;
    currency?: string;
    billingCycle?: string;
    nextPaymentAt?: Date | null;
    category?: string | null;
    notes?: string | null;
    isActive?: boolean;
  };
}) {
  const [updated] = await db.update(subscriptionsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(
      eq(subscriptionsTable.id, subscriptionId),
      eq(subscriptionsTable.organizationId, organizationId),
    ))
    .returning();
  if (!updated) {
    throw new Error('Subscription not found');
  }
  return { subscription: updated };
}

async function deleteSubscription({ db, subscriptionId, organizationId }: {
  db: Database;
  subscriptionId: string;
  organizationId: string;
}) {
  await db.delete(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.id, subscriptionId),
      eq(subscriptionsTable.organizationId, organizationId),
    ));
}

async function searchTransactionsAggregate({ db, organizationId, searchText, dateFrom, dateTo }: {
  db: Database;
  organizationId: string;
  searchText: string;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const searchPattern = `%${searchText}%`;

  const filters = and(
    eq(transactionsTable.organizationId, organizationId),
    or(
      like(transactionsTable.counterparty, searchPattern),
      like(transactionsTable.description, searchPattern),
    ),
    dateFrom ? gte(transactionsTable.date, dateFrom) : undefined,
    dateTo ? lte(transactionsTable.date, dateTo) : undefined,
  );

  const [stats] = await db.select({
    count: sql<number>`COUNT(*)`,
    totalAmount: sql<number>`COALESCE(SUM(${transactionsTable.amount}), 0)`,
    totalExpenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.amount} < 0 THEN ABS(${transactionsTable.amount}) ELSE 0 END), 0)`,
    totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.amount} > 0 THEN ${transactionsTable.amount} ELSE 0 END), 0)`,
    avgAmount: sql<number>`COALESCE(AVG(${transactionsTable.amount}), 0)`,
    minDate: sql<string>`MIN(datetime(${transactionsTable.date} / 1000, 'unixepoch'))`,
    maxDate: sql<string>`MAX(datetime(${transactionsTable.date} / 1000, 'unixepoch'))`,
  }).from(transactionsTable).where(filters);

  const transactions = await db.select({
    id: transactionsTable.id,
    date: transactionsTable.date,
    description: transactionsTable.description,
    amount: transactionsTable.amount,
    currency: transactionsTable.currency,
    counterparty: transactionsTable.counterparty,
    classification: transactionsTable.classification,
  }).from(transactionsTable).where(filters).orderBy(desc(transactionsTable.date)).limit(200);

  return {
    stats: {
      count: stats?.count ?? 0,
      totalAmount: stats?.totalAmount ?? 0,
      totalExpenses: stats?.totalExpenses ?? 0,
      totalIncome: stats?.totalIncome ?? 0,
      avgAmount: stats?.avgAmount ?? 0,
      dateRange: { from: stats?.minDate, to: stats?.maxDate },
    },
    transactions,
  };
}

async function getSpendingBreakdown({ db, organizationId, groupBy, dateFrom, dateTo, limit = 30 }: {
  db: Database;
  organizationId: string;
  groupBy: 'counterparty' | 'classification';
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}) {
  const filters = and(
    eq(transactionsTable.organizationId, organizationId),
    dateFrom ? gte(transactionsTable.date, dateFrom) : undefined,
    dateTo ? lte(transactionsTable.date, dateTo) : undefined,
  );

  const groupColumn = groupBy === 'counterparty'
    ? transactionsTable.counterparty
    : transactionsTable.classification;

  const rows = await db.select({
    group: groupColumn,
    count: sql<number>`COUNT(*)`,
    totalAmount: sql<number>`COALESCE(SUM(${transactionsTable.amount}), 0)`,
    totalExpenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.amount} < 0 THEN ABS(${transactionsTable.amount}) ELSE 0 END), 0)`,
    totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.amount} > 0 THEN ${transactionsTable.amount} ELSE 0 END), 0)`,
    avgAmount: sql<number>`COALESCE(AVG(${transactionsTable.amount}), 0)`,
  }).from(transactionsTable).where(filters).groupBy(groupColumn).orderBy(desc(sql`SUM(ABS(${transactionsTable.amount}))`)).limit(limit);

  return { breakdown: rows };
}

async function getUnclassifiedCounterpartySummary({ db, organizationId }: {
  db: Database;
  organizationId: string;
}) {
  const [totalRow] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.organizationId, organizationId),
      isNull(transactionsTable.classification),
    ));

  // Fetch all unclassified transactions
  const allTransactions = await db.select({
    description: transactionsTable.description,
    amount: transactionsTable.amount,
    counterparty: transactionsTable.counterparty,
  })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.organizationId, organizationId),
      isNull(transactionsTable.classification),
    ))
    .limit(1000);

  // Server-side pattern extraction
  const patterns = extractTransactionPatterns(allTransactions);

  return {
    totalUnclassified: totalRow?.count ?? 0,
    patterns,
  };
}

function tokenizeDescription(text: string): string[] {
  return text
    .replace(/[*\/\\(){}[\]#@!?.,;:'"<>+=|~`^&%$_]/g, ' ')
    .split(/\s+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 4 && !/^\d+$/.test(w) && !/^\d+[.,]\d+$/.test(w));
}

function extractTransactionPatterns(transactions: Array<{ description: string | null; amount: number | null; counterparty: string | null }>) {
  if (transactions.length === 0) return [];

  // Step 1: Detect template words — words at the SAME position in >20% of descriptions.
  // "Sent Money to Raul" / "Sent Money to Pedro" → "sent"(pos 0), "money"(pos 1) are templates.
  const positionWordCounts = new Map<string, number>();
  const allTokenized: Array<{ words: string[]; tx: typeof transactions[number] }> = [];

  for (const tx of transactions) {
    if (!tx.description?.trim()) {
      allTokenized.push({ words: [], tx });
      continue;
    }
    const words = tokenizeDescription(tx.description);
    allTokenized.push({ words, tx });
    for (let i = 0; i < Math.min(words.length, 5); i++) {
      const key = `${i}:${words[i]}`;
      positionWordCounts.set(key, (positionWordCounts.get(key) ?? 0) + 1);
    }
  }

  const templateThreshold = Math.max(3, transactions.length * 0.2);
  const templateWords = new Set<string>();
  for (const [key, count] of positionWordCounts) {
    if (count >= templateThreshold) {
      templateWords.add(key.split(':').slice(1).join(':'));
    }
  }

  // Step 2: Extract entity keywords per transaction, tracking position (first entity vs later)
  const keywordStats = new Map<string, {
    count: number;
    firstPositionCount: number; // times this keyword was the FIRST entity word
    laterPositionCount: number; // times it was a subsequent entity word
    positiveCount: number;
    negativeCount: number;
    totalAmount: number;
    sampleDescriptions: Set<string>;
    field: 'description' | 'counterparty';
  }>();

  for (const { words, tx } of allTokenized) {
    const amount = tx.amount ?? 0;
    const desc = tx.description ?? tx.counterparty ?? '';

    // Counterparty keywords
    if (tx.counterparty?.trim()) {
      const cp = tx.counterparty.trim().toLowerCase();
      if (cp.length >= 4) {
        const key = `cp:${cp}`;
        const existing = keywordStats.get(key);
        if (existing) {
          existing.count++;
          existing.firstPositionCount++; // counterparty is always "first"
          existing.totalAmount += amount;
          if (amount > 0) existing.positiveCount++;
          if (amount < 0) existing.negativeCount++;
          if (existing.sampleDescriptions.size < 3) existing.sampleDescriptions.add(desc);
        } else {
          keywordStats.set(key, {
            count: 1, firstPositionCount: 1, laterPositionCount: 0,
            positiveCount: amount > 0 ? 1 : 0, negativeCount: amount < 0 ? 1 : 0,
            totalAmount: amount, sampleDescriptions: new Set([desc]), field: 'counterparty',
          });
        }
      }
    }

    // Description entity keywords (skip template words)
    let entityIndex = 0;
    for (const word of words) {
      if (entityIndex >= 2) break;
      if (templateWords.has(word)) continue;

      const key = `desc:${word}`;
      const isFirst = entityIndex === 0;
      entityIndex++;

      const existing = keywordStats.get(key);
      if (existing) {
        existing.count++;
        if (isFirst) existing.firstPositionCount++;
        else existing.laterPositionCount++;
        existing.totalAmount += amount;
        if (amount > 0) existing.positiveCount++;
        if (amount < 0) existing.negativeCount++;
        if (existing.sampleDescriptions.size < 3) existing.sampleDescriptions.add(desc);
      } else {
        keywordStats.set(key, {
          count: 1,
          firstPositionCount: isFirst ? 1 : 0,
          laterPositionCount: isFirst ? 0 : 1,
          positiveCount: amount > 0 ? 1 : 0,
          negativeCount: amount < 0 ? 1 : 0,
          totalAmount: amount, sampleDescriptions: new Set([desc]), field: 'description',
        });
      }
    }
  }

  // Step 3: Filter
  const totalTx = transactions.length;
  const candidates = [...keywordStats.entries()].filter(([_, v]) => {
    // Must appear in 2+ transactions
    if (v.count < 2) return false;

    // Hard cap: >40% of all transactions = too generic
    if (v.count > totalTx * 0.4) return false;

    // POSITION-BASED NOISE DETECTION:
    // A real entity keyword (merchant/person) is usually the FIRST significant word.
    // A location/suffix keyword is usually in later positions.
    // If a keyword appears as the first entity word less than 40% of the time, it's likely a suffix.
    // (Counterparty keywords skip this check — they're always the entity)
    if (v.field === 'description') {
      const firstRatio = v.firstPositionCount / v.count;
      if (firstRatio < 0.4) return false;
    }

    return true;
  });

  // Step 4: Sort by count desc, deduplicate
  candidates.sort((a, b) => b[1].count - a[1].count);

  const usedKeywords = new Set<string>();
  const finalPatterns: Array<{
    keyword: string;
    field: 'description' | 'counterparty';
    transactionCount: number;
    totalAmount: number;
    sampleDescriptions: string[];
    suggestedClassification: 'expense' | 'income';
    hasIncoming: boolean;
    hasOutgoing: boolean;
  }> = [];

  for (const [key, data] of candidates) {
    const rawKeyword = key.replace(/^(cp|desc):/, '');

    let isDuplicate = false;
    for (const used of usedKeywords) {
      if (rawKeyword.includes(used) || used.includes(rawKeyword)) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    usedKeywords.add(rawKeyword);

    // Classification: only expense or income. owner_transfer is too sensitive
    // to guess automatically — the AI must ask the user for identifying info.
    const suggestedClassification: 'expense' | 'income' = data.totalAmount < 0 ? 'expense' : 'income';

    finalPatterns.push({
      keyword: rawKeyword,
      field: data.field,
      transactionCount: data.count,
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      sampleDescriptions: [...data.sampleDescriptions],
      suggestedClassification,
      hasIncoming: data.positiveCount > 0,
      hasOutgoing: data.negativeCount > 0,
    });
  }

  return finalPatterns.slice(0, 30);
}

// ── Finance Goals ─────────────────────────────────────────────────────────────

const DEFAULT_BUCKETS = [
  { name: 'Needs', targetPercentage: 50, color: '#4ade80', position: 0, classifications: ['expense'], tagIds: [] },
  { name: 'Wants', targetPercentage: 30, color: '#f97316', position: 1, classifications: [], tagIds: [] },
  { name: 'Savings', targetPercentage: 20, color: '#60a5fa', position: 2, classifications: [], tagIds: [] },
] as const;

async function getFinanceGoal({ db, organizationId }: { db: Database; organizationId: string }) {
  const [goal] = await db.select().from(financeGoalsTable).where(eq(financeGoalsTable.organizationId, organizationId)).limit(1);
  return { goal: goal ?? null };
}

async function getOrCreateFinanceGoal({ db, organizationId }: { db: Database; organizationId: string }) {
  const { goal: existing } = await getFinanceGoal({ db, organizationId });
  if (existing !== null) {
    return { goal: existing };
  }

  const [goal] = await db.insert(financeGoalsTable).values({ organizationId, name: 'Budget' }).returning();
  if (!goal) {
    throw new Error('Failed to create finance goal');
  }

  await db.insert(financeGoalBucketsTable).values(
    DEFAULT_BUCKETS.map(b => ({
      goalId: goal.id,
      organizationId,
      name: b.name,
      targetPercentage: b.targetPercentage,
      color: b.color,
      position: b.position,
      tagIds: JSON.stringify(b.tagIds),
      classifications: JSON.stringify(b.classifications),
    })),
  );

  return { goal };
}

async function updateFinanceGoal({ db, goalId, organizationId, updates }: {
  db: Database;
  goalId: string;
  organizationId: string;
  updates: { name?: string };
}) {
  const [updated] = await db.update(financeGoalsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(financeGoalsTable.id, goalId), eq(financeGoalsTable.organizationId, organizationId)))
    .returning();
  return { goal: updated };
}

async function getFinanceGoalBuckets({ db, goalId }: { db: Database; goalId: string }) {
  const buckets = await db.select().from(financeGoalBucketsTable)
    .where(eq(financeGoalBucketsTable.goalId, goalId))
    .orderBy(financeGoalBucketsTable.position);

  return {
    buckets: buckets.map(b => ({
      ...b,
      tagIds: JSON.parse(b.tagIds as unknown as string) as string[],
      classifications: JSON.parse(b.classifications as unknown as string) as string[],
    })),
  };
}

async function createFinanceGoalBucket({ db, bucket }: {
  db: Database;
  bucket: {
    goalId: string;
    organizationId: string;
    name: string;
    targetPercentage: number;
    color: string;
    position: number;
    tagIds: string[];
    classifications: string[];
  };
}) {
  const [result] = await db.insert(financeGoalBucketsTable).values({
    ...bucket,
    tagIds: JSON.stringify(bucket.tagIds),
    classifications: JSON.stringify(bucket.classifications),
  }).returning();
  if (!result) {
    throw new Error('Failed to create finance goal bucket');
  }
  return {
    bucket: {
      ...result,
      tagIds: JSON.parse(result.tagIds as unknown as string) as string[],
      classifications: JSON.parse(result.classifications as unknown as string) as string[],
    },
  };
}

async function updateFinanceGoalBucket({ db, bucketId, goalId, updates }: {
  db: Database;
  bucketId: string;
  goalId: string;
  updates: {
    name?: string;
    targetPercentage?: number;
    color?: string;
    position?: number;
    tagIds?: string[];
    classifications?: string[];
  };
}) {
  const dbUpdates: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  if (updates.tagIds !== undefined) {
    dbUpdates.tagIds = JSON.stringify(updates.tagIds);
  }
  if (updates.classifications !== undefined) {
    dbUpdates.classifications = JSON.stringify(updates.classifications);
  }

  const [updated] = await db.update(financeGoalBucketsTable)
    .set(dbUpdates)
    .where(and(eq(financeGoalBucketsTable.id, bucketId), eq(financeGoalBucketsTable.goalId, goalId)))
    .returning();

  if (!updated) {
    return { bucket: null };
  }

  return {
    bucket: {
      ...updated,
      tagIds: JSON.parse(updated.tagIds as unknown as string) as string[],
      classifications: JSON.parse(updated.classifications as unknown as string) as string[],
    },
  };
}

async function deleteFinanceGoalBucket({ db, bucketId, goalId }: { db: Database; bucketId: string; goalId: string }) {
  await db.delete(financeGoalBucketsTable)
    .where(and(eq(financeGoalBucketsTable.id, bucketId), eq(financeGoalBucketsTable.goalId, goalId)));
}

async function snapshotGoalVersion({ db, goalId, organizationId }: { db: Database; goalId: string; organizationId: string }) {
  const [goal] = await db.select({ name: financeGoalsTable.name })
    .from(financeGoalsTable)
    .where(and(eq(financeGoalsTable.id, goalId), eq(financeGoalsTable.organizationId, organizationId)))
    .limit(1);

  const buckets = await db.select().from(financeGoalBucketsTable)
    .where(eq(financeGoalBucketsTable.goalId, goalId))
    .orderBy(financeGoalBucketsTable.position);

  const bucketsSnapshot = JSON.stringify(buckets.map(b => ({
    id: b.id,
    name: b.name,
    targetPercentage: b.targetPercentage,
    color: b.color,
    position: b.position,
    tagIds: JSON.parse(b.tagIds as unknown as string) as string[],
    classifications: JSON.parse(b.classifications as unknown as string) as string[],
  })));

  // Debounce: if the last version was created < 5 minutes ago, overwrite it instead of creating a new one
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [lastVersion] = await db.select()
    .from(financeGoalVersionsTable)
    .where(eq(financeGoalVersionsTable.goalId, goalId))
    .orderBy(desc(financeGoalVersionsTable.versionNumber))
    .limit(1);

  if (lastVersion && lastVersion.createdAt > fiveMinutesAgo) {
    const [updated] = await db.update(financeGoalVersionsTable)
      .set({ name: goal?.name ?? 'Budget', bucketsSnapshot, updatedAt: new Date() })
      .where(eq(financeGoalVersionsTable.id, lastVersion.id))
      .returning();
    return { version: updated! };
  }

  const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;
  const [version] = await db.insert(financeGoalVersionsTable).values({
    goalId,
    organizationId,
    versionNumber: nextVersionNumber,
    name: goal?.name ?? 'Budget',
    bucketsSnapshot,
  }).returning();
  return { version: version! };
}

async function listGoalVersions({ db, goalId }: { db: Database; goalId: string }) {
  const versions = await db.select({
    id: financeGoalVersionsTable.id,
    versionNumber: financeGoalVersionsTable.versionNumber,
    name: financeGoalVersionsTable.name,
    bucketsSnapshot: financeGoalVersionsTable.bucketsSnapshot,
    createdAt: financeGoalVersionsTable.createdAt,
  })
    .from(financeGoalVersionsTable)
    .where(eq(financeGoalVersionsTable.goalId, goalId))
    .orderBy(desc(financeGoalVersionsTable.versionNumber));

  return {
    versions: versions.map(v => ({
      ...v,
      buckets: JSON.parse(v.bucketsSnapshot as unknown as string) as Array<{
        id: string; name: string; targetPercentage: number; color: string; position: number; tagIds: string[]; classifications: string[];
      }>,
    })),
  };
}

async function restoreGoalVersion({ db, versionId, goalId, organizationId }: { db: Database; versionId: string; goalId: string; organizationId: string }) {
  const [version] = await db.select()
    .from(financeGoalVersionsTable)
    .where(and(eq(financeGoalVersionsTable.id, versionId), eq(financeGoalVersionsTable.goalId, goalId)))
    .limit(1);

  if (!version) {
    throw new Error('Goal version not found');
  }

  const snapshotBuckets: Array<{
    name: string; targetPercentage: number; color: string; position: number; tagIds: string[]; classifications: string[];
  }> = JSON.parse(version.bucketsSnapshot as unknown as string);

  // Restore goal name
  await db.update(financeGoalsTable)
    .set({ name: version.name, updatedAt: new Date() })
    .where(and(eq(financeGoalsTable.id, goalId), eq(financeGoalsTable.organizationId, organizationId)));

  // Replace all current buckets with the snapshot
  await db.delete(financeGoalBucketsTable).where(eq(financeGoalBucketsTable.goalId, goalId));

  if (snapshotBuckets.length > 0) {
    await db.insert(financeGoalBucketsTable).values(
      snapshotBuckets.map(b => ({
        goalId,
        organizationId,
        name: b.name,
        targetPercentage: b.targetPercentage,
        color: b.color,
        position: b.position,
        tagIds: JSON.stringify(b.tagIds),
        classifications: JSON.stringify(b.classifications),
      })),
    );
  }

  // Auto-snapshot after restore so the restored state is itself a new version
  const { version: newVersion } = await snapshotGoalVersion({ db, goalId, organizationId });

  return { success: true, restoredFrom: version.versionNumber, newVersionNumber: newVersion.versionNumber };
}
