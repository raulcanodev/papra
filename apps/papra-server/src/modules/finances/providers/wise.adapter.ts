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

      if (!profileId || !balanceId) {
        throw new Error('Wise requires an account ID in the format profileId:balanceId. Use "fetch accounts" to find your IDs.');
      }

      // Get the balance currency first so the statement endpoint works
      const balancesRes = await fetch(`https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!balancesRes.ok) {
        throw new Error(`Wise API error fetching balances: ${balancesRes.status}`);
      }

      const balances = await balancesRes.json() as Array<{ id: number; currency: string }>;
      const balance = balances.find(b => String(b.id) === balanceId);

      if (!balance) {
        throw new Error(`Wise balance ${balanceId} not found in profile ${profileId}`);
      }

      const now = new Date();
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const params = new URLSearchParams();
      params.set('currency', balance.currency);
      params.set('type', 'COMPACT');
      params.set('intervalStart', (fromDate ?? sixMonthsAgo).toISOString());
      params.set('intervalEnd', now.toISOString());

      const url = `https://api.wise.com/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Wise API error: ${response.status} ${body}`);
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
