import type { BankProviderAdapter, ProviderBalance, ProviderTransaction } from './provider.types';

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
      // Default to 2 years ago for first sync to get full history
      const startDate = fromDate ?? new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

      const allTransactions: ProviderTransaction[] = [];
      let offset = 0;
      const limit = 1000;

      while (true) {
        const params = new URLSearchParams();
        params.set('start', startDate.toISOString().split('T')[0]!);
        params.set('limit', String(limit));
        params.set('offset', String(offset));

        const url = `${baseUrl}/account/${accountId}/transactions?${params.toString()}`;
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Mercury API error: ${response.status}`);
        }

        const data = await response.json() as {
          total: number;
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

        allTransactions.push(...transactions);

        // If we got fewer than limit, we've reached the end
        if (data.transactions.length < limit) {
          break;
        }
        offset += limit;
      }

      return { transactions: allTransactions };
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

    fetchBalances: async ({ apiKey }) => {
      const response = await fetch(`${baseUrl}/accounts`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Mercury API error: ${response.status}`);
      }

      const data = await response.json() as { accounts: Array<{ id: string; name: string; currentBalance: number }> };

      const balances: ProviderBalance[] = data.accounts.map(a => ({
        accountId: a.id,
        accountName: a.name,
        balance: a.currentBalance,
        currency: 'USD',
      }));

      return { balances };
    },
  };
}
