const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedRates: { base: string; rates: Record<string, number>; fetchedAt: number } | null = null;

export async function getExchangeRates({ base }: { base: string }): Promise<Record<string, number>> {
  if (cachedRates !== null && cachedRates.base === base && Date.now() - cachedRates.fetchedAt < CACHE_TTL_MS) {
    return cachedRates.rates;
  }

  const response = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`);

  if (!response.ok) {
    throw new Error(`Exchange rate API error: ${response.status}`);
  }

  const data = await response.json() as { base: string; rates: Record<string, number> };

  cachedRates = { base: data.base, rates: { ...data.rates, [base]: 1 }, fetchedAt: Date.now() };

  return cachedRates.rates;
}

export async function convertCurrency({ amount, from, to }: { amount: number; from: string; to: string }): Promise<number> {
  if (from === to) {
    return amount;
  }

  const rates = await getExchangeRates({ base: from });
  const rate = rates[to];

  if (rate == null) {
    throw new Error(`No exchange rate found for ${from} -> ${to}`);
  }

  return amount * rate;
}
