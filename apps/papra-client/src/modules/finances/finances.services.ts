import type { BankConnection, ProviderAccount, Transaction } from './finances.types';
import { apiClient } from '../shared/http/api-client';

export async function fetchBankConnections({ organizationId }: { organizationId: string }) {
  return apiClient<{ bankConnections: BankConnection[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/bank-connections`,
  });
}

export async function createBankConnection({ organizationId, provider, name, apiKey, accountId }: {
  organizationId: string;
  provider: string;
  name: string;
  apiKey: string;
  accountId?: string;
}) {
  return apiClient<{ bankConnection: BankConnection }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/bank-connections`,
    body: { provider, name, apiKey, accountId },
  });
}

export async function deleteBankConnection({ organizationId, bankConnectionId }: {
  organizationId: string;
  bankConnectionId: string;
}) {
  return apiClient<{ success: boolean }>({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finances/bank-connections/${bankConnectionId}`,
  });
}

export async function syncBankConnection({ organizationId, bankConnectionId }: {
  organizationId: string;
  bankConnectionId: string;
}) {
  return apiClient<{ insertedCount: number }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/bank-connections/${bankConnectionId}/sync`,
  });
}

export async function fetchTransactions({ organizationId, pageIndex, pageSize, bankConnectionId, classification }: {
  organizationId: string;
  pageIndex: number;
  pageSize: number;
  bankConnectionId?: string;
  classification?: string;
}) {
  return apiClient<{ transactions: Transaction[]; transactionsCount: number }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/transactions`,
    query: { pageIndex, pageSize, bankConnectionId, classification },
  });
}

export async function updateTransactionClassification({ organizationId, transactionId, classification }: {
  organizationId: string;
  transactionId: string;
  classification: string | null;
}) {
  return apiClient<{ transaction: Transaction }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/finances/transactions/${transactionId}`,
    body: { classification },
  });
}

export async function fetchBankProviderAccounts({ organizationId, provider, apiKey }: {
  organizationId: string;
  provider: string;
  apiKey: string;
}) {
  return apiClient<{ accounts: ProviderAccount[] }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/bank-connections/accounts`,
    body: { provider, apiKey },
  });
}
