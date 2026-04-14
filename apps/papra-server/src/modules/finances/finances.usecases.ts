import type { BankProvider } from './finances.constants';
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
