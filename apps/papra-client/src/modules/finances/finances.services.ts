import type { BankConnection, ClassificationRule, OverviewStats, ProviderAccount, Subscription, Transaction } from './finances.types';
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

export async function updateBankConnection({ organizationId, bankConnectionId, name, accountId, apiKey }: {
  organizationId: string;
  bankConnectionId: string;
  name?: string;
  accountId?: string | null;
  apiKey?: string;
}) {
  return apiClient<{ bankConnection: BankConnection }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/finances/bank-connections/${bankConnectionId}`,
    body: { name, accountId, apiKey },
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

export async function syncBankConnection({ organizationId, bankConnectionId, fullSync = false }: {
  organizationId: string;
  bankConnectionId: string;
  fullSync?: boolean;
}) {
  return apiClient<{ insertedCount: number }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/bank-connections/${bankConnectionId}/sync${fullSync ? '?fullSync=true' : ''}`,
  });
}

export async function fetchTransactions({ organizationId, pageIndex, pageSize, bankConnectionId, classification, search, amountFilter, amountValue, dateFrom, dateTo }: {
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
  return apiClient<{ transactions: Transaction[]; transactionsCount: number; totalAmount: number; totalAmountEur: number | null; totalAmountUsd: number | null }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/transactions`,
    query: { pageIndex, pageSize, bankConnectionId, classification, search, amountFilter, amountValue, dateFrom, dateTo },
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

export async function fetchClassificationRules({ organizationId }: { organizationId: string }) {
  return apiClient<{ rules: ClassificationRule[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/classification-rules`,
  });
}

export async function createClassificationRule({ organizationId, rule }: {
  organizationId: string;
  rule: { name: string; classification?: string; conditions: Array<{ field: string; operator: string; value: string }>; conditionMatchMode?: 'all' | 'any'; tagIds?: string[]; priority?: number };
}) {
  return apiClient<{ rule: ClassificationRule }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/classification-rules`,
    body: rule,
  });
}

export async function updateClassificationRule({ organizationId, ruleId, updates }: {
  organizationId: string;
  ruleId: string;
  updates: Partial<{ name: string; classification: string; conditions: Array<{ field: string; operator: string; value: string }>; conditionMatchMode: 'all' | 'any'; tagIds: string[]; priority: number; isActive: boolean }>;
}) {
  return apiClient<{ rule: ClassificationRule }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/finances/classification-rules/${ruleId}`,
    body: updates,
  });
}

export async function deleteClassificationRule({ organizationId, ruleId }: {
  organizationId: string;
  ruleId: string;
}) {
  return apiClient<{ success: boolean }>({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finances/classification-rules/${ruleId}`,
  });
}

export async function autoClassifyTransactions({ organizationId }: { organizationId: string }) {
  return apiClient<{ classifiedCount: number }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/auto-classify`,
  });
}

export async function fetchOverviewStats({ organizationId }: { organizationId: string }) {
  return apiClient<OverviewStats>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/overview`,
  });
}

export async function fetchSubscriptions({ organizationId }: { organizationId: string }) {
  return apiClient<{ subscriptions: Subscription[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/subscriptions`,
  });
}

export async function createSubscription({ organizationId, subscription }: {
  organizationId: string;
  subscription: {
    name: string;
    amount: number;
    currency: string;
    billingCycle: string;
    nextPaymentAt?: Date | null;
    category?: string | null;
    notes?: string | null;
    transactionSearchQuery?: string | null;
    tagIds?: string[];
  };
}) {
  return apiClient<{ subscription: Subscription }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/subscriptions`,
    body: subscription,
  });
}

export async function updateSubscription({ organizationId, subscriptionId, updates }: {
  organizationId: string;
  subscriptionId: string;
  updates: Partial<{
    name: string;
    amount: number;
    currency: string;
    billingCycle: string;
    nextPaymentAt: Date | null;
    category: string | null;
    notes: string | null;
    isActive: boolean;
    transactionSearchQuery: string | null;
    tagIds: string[];
  }>;
}) {
  return apiClient<{ subscription: Subscription }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/finances/subscriptions/${subscriptionId}`,
    body: updates,
  });
}

export async function deleteSubscription({ organizationId, subscriptionId }: {
  organizationId: string;
  subscriptionId: string;
}) {
  return apiClient<{ success: boolean }>({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finances/subscriptions/${subscriptionId}`,
  });
}

export async function fetchTransactionCustomProperties({ organizationId, transactionId }: {
  organizationId: string;
  transactionId: string;
}) {
  return apiClient<{ values: Array<{ value: { id: string; propertyDefinitionId: string; textValue: string | null; numberValue: number | null; dateValue: string | null; booleanValue: boolean | null; selectOptionId: string | null }; definition: { id: string; name: string; key: string; type: string }; option: { id: string; name: string } | null }> }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finances/transactions/${transactionId}/custom-properties`,
  });
}

export async function addTagToTransaction({ organizationId, transactionId, tagId }: {
  organizationId: string;
  transactionId: string;
  tagId: string;
}) {
  return apiClient<{ success: boolean }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finances/transactions/${transactionId}/tags`,
    body: { tagId },
  });
}

export async function removeTagFromTransaction({ organizationId, transactionId, tagId }: {
  organizationId: string;
  transactionId: string;
  tagId: string;
}) {
  return apiClient<{ success: boolean }>({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finances/transactions/${transactionId}/tags/${tagId}`,
  });
}

type TransactionCustomPropertyValuesEntry = {
  textValue?: string | null;
  numberValue?: number | null;
  dateValue?: string | null;
  booleanValue?: boolean | null;
  selectOptionId?: string | null;
};

function buildTransactionCustomPropertyValues(type: string, value: string | number | boolean | string[]): TransactionCustomPropertyValuesEntry[] {
  if (type === 'text') {
    return [{ textValue: value as string }];
  }
  if (type === 'number') {
    return [{ numberValue: value as number }];
  }
  if (type === 'date') {
    return [{ dateValue: value as string }];
  }
  if (type === 'boolean') {
    return [{ booleanValue: value as boolean }];
  }
  if (type === 'select') {
    return [{ selectOptionId: value as string }];
  }
  if (type === 'multi_select') {
    return (value as string[]).map(id => ({ selectOptionId: id }));
  }
  return [{ textValue: String(value) }];
}

export async function setTransactionCustomPropertyValue({ organizationId, transactionId, propertyDefinitionId, value, type }: {
  organizationId: string;
  transactionId: string;
  propertyDefinitionId: string;
  value: string | number | boolean | string[];
  type: string;
}) {
  return apiClient({
    method: 'PUT',
    path: `/api/organizations/${organizationId}/finances/transactions/${transactionId}/custom-properties/${propertyDefinitionId}`,
    body: { values: buildTransactionCustomPropertyValues(type, value) },
  });
}

export async function deleteTransactionCustomPropertyValue({ organizationId, transactionId, propertyDefinitionId }: {
  organizationId: string;
  transactionId: string;
  propertyDefinitionId: string;
}) {
  return apiClient({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finances/transactions/${transactionId}/custom-properties/${propertyDefinitionId}`,
  });
}
