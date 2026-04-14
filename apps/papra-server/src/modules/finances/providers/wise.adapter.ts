import type { BankProviderAdapter, ProviderTransaction } from './provider.types';

export function createWiseAdapter(): BankProviderAdapter {
  const baseUrl = 'https://api.wise.com';

  return {
    fetchAccounts: async ({ apiKey }) => {
      const profilesRes = await fetch(`${baseUrl}/v2/profiles`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!profilesRes.ok) {
        throw new Error(`Wise API error: ${profilesRes.status}`);
      }

      const profiles = await profilesRes.json() as Array<{ id: number; type: string; fullName: string }>;

      const accounts: Array<{ id: string; name: string }> = [];
      for (const profile of profiles) {
        const balancesRes = await fetch(`${baseUrl}/v4/profiles/${profile.id}/balances?types=STANDARD`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (balancesRes.ok) {
          const balances = await balancesRes.json() as Array<{ id: number; currency: string }>;
          for (const balance of balances) {
            accounts.push({
              id: `${profile.id}:${balance.id}`,
              name: `${profile.fullName} - ${balance.currency}`,
            });
          }
        }
      }

      return { accounts };
    },

    fetchTransactions: async ({ apiKey, accountId, fromDate }) => {
      const [profileId, balanceId] = (accountId ?? '').split(':');

      const params = new URLSearchParams();
      params.set('currency', 'USD');
      params.set('type', 'COMPACT');
      if (fromDate) {
        params.set('intervalStart', fromDate.toISOString());
      }
      params.set('intervalEnd', new Date().toISOString());

      const url = `${baseUrl}/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`Wise API error: ${response.status}`);
      }

      const data = await response.json() as {
        transactions: Array<{
          referenceNumber: string;
          date: string;
          amount: { value: number; currency: string };
          details: { description: string; type: string };
          runningBalance: { value: number };
        }>;
      };

      const transactions: ProviderTransaction[] = (data.transactions ?? []).map(t => ({
        externalId: t.referenceNumber,
        date: new Date(t.date),
        description: t.details?.description || 'No description',
        amount: t.amount.value,
        currency: t.amount.currency,
        counterparty: undefined,
        status: 'posted' as const,
        rawData: t as unknown as Record<string, unknown>,
      }));

      return { transactions };
    },

    validateApiKey: async ({ apiKey }) => {
      try {
        const response = await fetch(`${baseUrl}/v2/profiles`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return { isValid: response.ok };
      } catch {
        return { isValid: false };
      }
    },
  };
}
