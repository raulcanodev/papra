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
      let resolvedProfileId: string;
      let resolvedBalanceId: string;
      let resolvedCurrency: string;

      if (accountId && accountId.includes(':')) {
        const [profileId, balanceId] = accountId.split(':');
        if (!profileId || !balanceId) {
          throw new Error('Wise account ID must be in the format profileId:balanceId.');
        }

        const balancesRes = await fetch(`${baseUrl}/v4/profiles/${profileId}/balances?types=STANDARD`, {
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

        resolvedProfileId = profileId;
        resolvedBalanceId = balanceId;
        resolvedCurrency = balance.currency;
      }
      else {
        // No accountId provided — auto-detect the first available balance
        const profilesRes = await fetch(`${baseUrl}/v2/profiles`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!profilesRes.ok) {
          throw new Error(`Wise API error fetching profiles: ${profilesRes.status}`);
        }

        const profiles = await profilesRes.json() as Array<{ id: number; type: string }>;

        let found: { profileId: string; balanceId: string; currency: string } | undefined;

        for (const profile of profiles) {
          const balancesRes = await fetch(`${baseUrl}/v4/profiles/${profile.id}/balances?types=STANDARD`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });

          if (balancesRes.ok) {
            const balances = await balancesRes.json() as Array<{ id: number; currency: string }>;
            const first = balances[0];
            if (first !== undefined) {
              found = { profileId: String(profile.id), balanceId: String(first.id), currency: first.currency };
              break;
            }
          }
        }

        if (!found) {
          throw new Error('No Wise balance accounts found. Please set a Profile:Balance ID manually.');
        }

        resolvedProfileId = found.profileId;
        resolvedBalanceId = found.balanceId;
        resolvedCurrency = found.currency;
      }

      const now = new Date();
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const params = new URLSearchParams();
      params.set('currency', resolvedCurrency);
      params.set('type', 'COMPACT');
      params.set('intervalStart', (fromDate ?? sixMonthsAgo).toISOString());
      params.set('intervalEnd', now.toISOString());

      const url = `${baseUrl}/v1/profiles/${resolvedProfileId}/balance-statements/${resolvedBalanceId}/statement.json?${params.toString()}`;
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
