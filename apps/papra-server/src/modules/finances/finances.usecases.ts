import type { BankProvider, TransactionClassification } from './finances.constants';
import type { FinancesRepository } from './finances.repository';
import { getBankProviderAdapter } from './providers/provider.registry';
import { createBankSyncError } from './finances.errors';

export async function syncBankTransactions({
  bankConnectionId,
  organizationId,
  financesRepository,
}: {
  bankConnectionId: string;
  organizationId: string;
  financesRepository: FinancesRepository;
}) {
  const { bankConnection } = await financesRepository.getBankConnectionById({ bankConnectionId, organizationId });
  const adapter = getBankProviderAdapter({ provider: bankConnection.provider as BankProvider });

  try {
    const { transactions: providerTransactions } = await adapter.fetchTransactions({
      apiKey: bankConnection.apiKey,
      accountId: bankConnection.providerAccountId ?? undefined,
      fromDate: bankConnection.lastSyncedAt ?? undefined,
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

    // Auto-classify newly inserted transactions
    if (insertedCount > 0) {
      await autoClassifyTransactions({ organizationId, financesRepository });
    }

    return { insertedCount };
  } catch (error) {
    throw createBankSyncError({ cause: error });
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

function doesRuleMatch(rule: { field: string; operator: string; value: string }, transaction: { description: string; counterparty: string | null; amount: number }): boolean {
  let fieldValue: string;

  if (rule.field === 'counterparty') {
    fieldValue = (transaction.counterparty ?? '').toLowerCase();
  }
  else if (rule.field === 'description') {
    fieldValue = transaction.description.toLowerCase();
  }
  else if (rule.field === 'amount') {
    const ruleNum = Number.parseFloat(rule.value);
    if (Number.isNaN(ruleNum)) return false;
    if (rule.operator === 'gt') return transaction.amount > ruleNum;
    if (rule.operator === 'lt') return transaction.amount < ruleNum;
    if (rule.operator === 'equals') return transaction.amount === ruleNum;
    return false;
  }
  else {
    return false;
  }

  const ruleValue = rule.value.toLowerCase();

  switch (rule.operator) {
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

export async function autoClassifyTransactions({
  organizationId,
  financesRepository,
}: {
  organizationId: string;
  financesRepository: FinancesRepository;
}) {
  const { rules } = await financesRepository.getClassificationRules({ organizationId });
  const activeRules = rules.filter(r => r.isActive);

  if (activeRules.length === 0) {
    return { classifiedCount: 0 };
  }

  // Get unclassified transactions (page through all of them)
  let classifiedCount = 0;
  let pageIndex = 0;
  const pageSize = 100;

  while (true) {
    const { transactions } = await financesRepository.getTransactions({
      organizationId,
      pageIndex,
      pageSize,
      classification: '__unclassified__',
    });

    if (transactions.length === 0) break;

    for (const transaction of transactions) {
      if (transaction.classification) continue;

      for (const rule of activeRules) {
        if (doesRuleMatch(rule, transaction)) {
          await financesRepository.updateTransactionClassification({
            transactionId: transaction.id,
            organizationId,
            classification: rule.classification as TransactionClassification,
          });
          classifiedCount++;
          break; // First matching rule wins (highest priority first)
        }
      }
    }

    if (transactions.length < pageSize) break;
    pageIndex++;
  }

  return { classifiedCount };
}
