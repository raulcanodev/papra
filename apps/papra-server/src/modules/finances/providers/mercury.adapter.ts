import type { BankProviderAdapter, ProviderTransaction } from './provider.types';

export function createMercuryAdapter(): BankProviderAdapter {
  const baseUrl = 'https://api.mercury.com/api/v1';

  return {
    fetchAccounts: async ({ apiKey }) => {
      const response = await fetch(`${baseUrl}/accounts`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Mercury API error: ${response.status}`);
      }

      const data = await response.json() as { accounts: Array<{ id: string; name: string }> };

      return {
        accounts: data.accounts.map(a => ({ id: a.id, name: a.name })),
      };
    },

    fetchTransactions: async ({ apiKey, accountId, fromDate }) => {
      const params = new URLSearchParams();
      if (fromDate) {
        params.set('start', fromDate.toISOString().split('T')[0]!);
      }
      params.set('limit', '500');

      const url = `${baseUrl}/account/${accountId}/transactions?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Mercury API error: ${response.status}`);
      }

      const data = await response.json() as {
        transactions: Array<{
          id: string;
          amount: number;
          createdAt: string;
          note: string;
          counterpartyName: string;
          status: string;
          details: Record<string, unknown>;
        }>;
      };

      const transactions: ProviderTransaction[] = data.transactions.map(t => ({
        externalId: t.id,
        date: new Date(t.createdAt),
        description: t.note || t.counterpartyName || 'No description',
        amount: t.amount,
        currency: 'USD',
        counterparty: t.counterpartyName ?? undefined,
        status: t.status === 'pending' ? 'pending' : 'posted',
        rawData: t as unknown as Record<string, unknown>,
      }));

      return { transactions };
    },

    validateApiKey: async ({ apiKey }) => {
      try {
        const response = await fetch(`${baseUrl}/accounts`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });
        return { isValid: response.ok };
      } catch {
        return { isValid: false };
      }
    },
  };
}
