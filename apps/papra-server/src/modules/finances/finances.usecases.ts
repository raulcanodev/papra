import type { TagsRepository } from '../tags/tags.repository';
import type { Database } from '../app/database/database.types';
import type { BankProvider, TransactionClassification } from './finances.constants';
import type { FinancesRepository } from './finances.repository';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { transactionTagsTable } from '../tags/tags.table';
import { financeGoalVersionsTable, transactionsTable } from './finances.table';
import { createBankSyncError } from './finances.errors';
import { getBankProviderAdapter } from './providers/provider.registry';

export async function syncBankTransactions({
  bankConnectionId,
  organizationId,
  financesRepository,
  fullSync = false,
}: {
  bankConnectionId: string;
  organizationId: string;
  financesRepository: FinancesRepository;
  fullSync?: boolean;
}) {
  const { bankConnection } = await financesRepository.getBankConnectionById({ bankConnectionId, organizationId });
  const adapter = getBankProviderAdapter({ provider: bankConnection.provider as BankProvider });

  try {
    const { transactions: providerTransactions } = await adapter.fetchTransactions({
      apiKey: bankConnection.apiKey,
      accountId: bankConnection.providerAccountId ?? undefined,
      fromDate: fullSync ? undefined : (bankConnection.lastSyncedAt ?? undefined),
    });

    const transactionsToInsert = providerTransactions.map(t => ({
      organizationId,
      bankConnectionId: bankConnection.id,
      externalId: t.externalId,
      date: t.date,
      description: t.description,
      amount: t.amount,
      currency: t.currency,
      counterparty: t.counterparty ?? null,
      status: t.status,
      provider: bankConnection.provider,
      rawData: JSON.stringify(t.rawData),
    }));

    const { insertedCount } = await financesRepository.upsertTransactions({ transactions: transactionsToInsert });
    await financesRepository.updateBankConnectionSyncTime({ bankConnectionId });

    // Fetch and cache account balance
    try {
      const { balances } = await adapter.fetchBalances({ apiKey: bankConnection.apiKey });
      const matchedBalance = bankConnection.providerAccountId != null
        ? balances.find(b => b.accountId === bankConnection.providerAccountId)
        : balances[0];

      if (matchedBalance) {
        await financesRepository.updateBankConnectionBalance({
          bankConnectionId,
          balance: matchedBalance.balance,
          currency: matchedBalance.currency,
        });
      }
    } catch {
      // Balance fetch is best-effort — don't fail the sync
    }

    // Auto-classify newly inserted transactions
    if (insertedCount > 0) {
      await autoClassifyTransactions({ organizationId, financesRepository });
    }

    return { insertedCount };
  } catch (error) {
    throw createBankSyncError({ cause: error });
  }
}

export async function refreshAccountBalances({
  organizationId,
  financesRepository,
}: {
  organizationId: string;
  financesRepository: FinancesRepository;
}) {
  const { bankConnections } = await financesRepository.getBankConnections({ organizationId });
  const activeConnections = bankConnections.filter(c => c.isActive);

  for (const connection of activeConnections) {
    try {
      const { bankConnection } = await financesRepository.getBankConnectionById({ bankConnectionId: connection.id, organizationId });
      const adapter = getBankProviderAdapter({ provider: bankConnection.provider as BankProvider });
      const { balances } = await adapter.fetchBalances({ apiKey: bankConnection.apiKey });

      const matchedBalance = bankConnection.providerAccountId != null
        ? balances.find(b => b.accountId === bankConnection.providerAccountId)
        : balances[0];

      if (matchedBalance) {
        await financesRepository.updateBankConnectionBalance({
          bankConnectionId: connection.id,
          balance: matchedBalance.balance,
          currency: matchedBalance.currency,
        });
      }
    } catch {
      // Best-effort per connection
    }
  }
}

export async function addBankConnection({
  organizationId,
  provider,
  name,
  apiKey,
  accountId,
  financesRepository,
}: {
  organizationId: string;
  provider: BankProvider;
  name: string;
  apiKey: string;
  accountId?: string;
  financesRepository: FinancesRepository;
}) {
  const adapter = getBankProviderAdapter({ provider });
  const { isValid } = await adapter.validateApiKey({ apiKey });

  if (!isValid) {
    throw createBankSyncError({ message: 'Invalid API key for the selected bank provider' });
  }

  const { bankConnection } = await financesRepository.createBankConnection({
    bankConnection: {
      organizationId,
      provider,
      name,
      apiKey,
      providerAccountId: accountId,
    },
  });

  return { bankConnection };
}

function doesConditionMatch(condition: { field: string; operator: string; value: string }, transaction: { description: string; counterparty: string | null; amount: number }): boolean {
  let fieldValue: string;

  if (condition.field === 'counterparty') {
    fieldValue = (transaction.counterparty ?? '').toLowerCase();
  } else if (condition.field === 'description') {
    fieldValue = transaction.description.toLowerCase();
  } else if (condition.field === 'amount') {
    const ruleNum = Number.parseFloat(condition.value);
    if (Number.isNaN(ruleNum)) {
      return false;
    }
    if (condition.operator === 'gt') {
      return transaction.amount > ruleNum;
    }
    if (condition.operator === 'lt') {
      return transaction.amount < ruleNum;
    }
    if (condition.operator === 'equals') {
      return transaction.amount === ruleNum;
    }
    return false;
  } else {
    return false;
  }

  const ruleValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return fieldValue.includes(ruleValue);
    case 'equals':
      return fieldValue === ruleValue;
    case 'starts_with':
      return fieldValue.startsWith(ruleValue);
    default:
      return false;
  }
}

function doesRuleMatch(rule: { conditions: Array<{ field: string; operator: string; value: string }> | string; conditionMatchMode: string }, transaction: { description: string; counterparty: string | null; amount: number }): boolean {
  const conditions = typeof rule.conditions === 'string'
    ? JSON.parse(rule.conditions) as Array<{ field: string; operator: string; value: string }>
    : rule.conditions;

  if (conditions.length === 0) {
    return true;
  }

  if (rule.conditionMatchMode === 'any') {
    return conditions.some(c => doesConditionMatch(c, transaction));
  }

  // Default: 'all' — all conditions must match
  return conditions.every(c => doesConditionMatch(c, transaction));
}

export async function autoClassifyTransactions({
  organizationId,
  financesRepository,
  tagsRepository,
}: {
  organizationId: string;
  financesRepository: FinancesRepository;
  tagsRepository?: TagsRepository;
}) {
  const { rules } = await financesRepository.getClassificationRules({ organizationId });
  const activeRules = rules.filter(r => r.isActive);

  if (activeRules.length === 0) {
    return { classifiedCount: 0 };
  }

  // Get unclassified transactions (page through all of them)
  let classifiedCount = 0;
  const classifiedByClassification: Record<string, number> = {};
  let pageIndex = 0;
  const pageSize = 100;

  while (true) {
    const { transactions } = await financesRepository.getTransactions({
      organizationId,
      pageIndex,
      pageSize,
      classification: '__unclassified__',
    });

    if (transactions.length === 0) {
      break;
    }

    for (const transaction of transactions) {
      if (transaction.classification) {
        continue;
      }

      for (const rule of activeRules) {
        if (doesRuleMatch(rule, transaction)) {
          await financesRepository.updateTransactionClassification({
            transactionId: transaction.id,
            organizationId,
            classification: rule.classification as TransactionClassification,
          });

          // Apply tags if the rule specifies any
          const ruleTagIds = rule.tagIds ?? [];
          if (ruleTagIds.length > 0 && tagsRepository) {
            await tagsRepository.addTagsToTransaction({ tagIds: ruleTagIds, transactionId: transaction.id });
          }

          classifiedCount++;
          classifiedByClassification[rule.classification] = (classifiedByClassification[rule.classification] ?? 0) + 1;
          break; // First matching rule wins (highest priority first)
        }
      }
    }

    if (transactions.length < pageSize) {
      break;
    }
    pageIndex++;
  }

  return { classifiedCount, classifiedByClassification };
}

export async function computeGoalActuals({
  db,
  organizationId,
  goalId,
  from,
  to,
  financesRepository,
}: {
  db: Database;
  organizationId: string;
  goalId: string;
  from: Date;
  to: Date;
  financesRepository: FinancesRepository;
}) {
  const { buckets } = await (async () => {
    // Use the version that was active at the start of the requested period
    const [activeVersion] = await db.select()
      .from(financeGoalVersionsTable)
      .where(and(
        eq(financeGoalVersionsTable.goalId, goalId),
        lte(financeGoalVersionsTable.createdAt, from),
      ))
      .orderBy(desc(financeGoalVersionsTable.versionNumber))
      .limit(1);

    if (activeVersion) {
      const parsed = JSON.parse(activeVersion.bucketsSnapshot as unknown as string) as Array<{
        id: string; name: string; targetPercentage: number; color: string;
        position: number; tagIds: string[]; classifications: string[];
      }>;
      return { buckets: parsed };
    }

    // No historical version yet — fall back to current live buckets
    return financesRepository.getFinanceGoalBuckets({ goalId });
  })();

  // Fetch all expense transactions in the date range
  const txns = await db.select({
    id: transactionsTable.id,
    amount: transactionsTable.amount,
    currency: transactionsTable.currency,
    classification: transactionsTable.classification,
  })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.organizationId, organizationId),
      gte(transactionsTable.date, from),
      lte(transactionsTable.date, to),
    ));

  // Fetch tag associations for those transactions
  const txnIds = txns.map(t => t.id);
  let tagMap: Map<string, string[]> = new Map();

  if (txnIds.length > 0) {
    const tagRows = await db.select({
      transactionId: transactionTagsTable.transactionId,
      tagId: transactionTagsTable.tagId,
    }).from(transactionTagsTable);

    for (const row of tagRows) {
      if (!txnIds.includes(row.transactionId)) {
        continue;
      }
      const existing = tagMap.get(row.transactionId) ?? [];
      existing.push(row.tagId);
      tagMap.set(row.transactionId, existing);
    }
  }

  // Only count outflows (negative amounts) in the denominator
  const expenseTxns = txns.filter(t => t.amount < 0);
  const totalAmount = expenseTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Determine the dominant currency (most frequent)
  const currencyCount: Record<string, number> = {};
  for (const t of expenseTxns) {
    currencyCount[t.currency] = (currencyCount[t.currency] ?? 0) + 1;
  }
  const currency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';

  // Assign each transaction to its first matching bucket
  const bucketTotals: Record<string, number> = {};
  const unassignedTotal = { amount: 0 };

  for (const txn of expenseTxns) {
    const txnTags = tagMap.get(txn.id) ?? [];
    let assigned = false;

    for (const bucket of buckets) {
      const matchesClassification
        = bucket.classifications.length > 0
        && txn.classification !== null
        && bucket.classifications.includes(txn.classification);

      const matchesTag
        = bucket.tagIds.length > 0
        && txnTags.some(tagId => bucket.tagIds.includes(tagId));

      if (matchesClassification || matchesTag) {
        bucketTotals[bucket.id] = (bucketTotals[bucket.id] ?? 0) + Math.abs(txn.amount);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      unassignedTotal.amount += Math.abs(txn.amount);
    }
  }

  const bucketsWithActuals = buckets.map(bucket => ({
    ...bucket,
    actualAmount: Math.round((bucketTotals[bucket.id] ?? 0) * 100) / 100,
    actualPercentage: totalAmount > 0
      ? Math.round(((bucketTotals[bucket.id] ?? 0) / totalAmount) * 10000) / 100
      : 0,
  }));

  return {
    buckets: bucketsWithActuals,
    totalAmount: Math.round(totalAmount * 100) / 100,
    unassignedAmount: Math.round(unassignedTotal.amount * 100) / 100,
    currency,
  };
}
