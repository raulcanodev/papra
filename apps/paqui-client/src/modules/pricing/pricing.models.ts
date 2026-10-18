/** Amounts typed by hand: "0,64", "16.75", "1.234,50" or empty (0); null when it is not a number */
export function parseAmountToMinor(text: string) {
  const trimmed = text.trim().replace(/\s|€/g, '');
  if (trimmed === '') {
    return 0;
  }
  // A comma is the decimal separator when present, dots are then thousands separators
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

export function formatMoney(amountMinor: number, currency = 'EUR') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amountMinor / 100);
}

export function formatRate(rateBps: number | null) {
  return rateBps === null ? '—' : `${(rateBps / 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}

// What is left of a price once the list discount is applied
export function getNetPriceMinor({ priceMinor, discountRateBps }: { priceMinor: number; discountRateBps: number }) {
  return priceMinor - Math.round(priceMinor * discountRateBps / 10_000);
}

/** Every price raised (or lowered with a negative rate) by a percentage, rounded to the cent */
export function adjustPriceMinor({ priceMinor, rateBps }: { priceMinor: number; rateBps: number }) {
  return Math.max(0, Math.round(priceMinor * (10_000 + rateBps) / 10_000));
}
