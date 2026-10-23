// Equivalence surcharge charged on top of each VAT rate to a retailer under that regime, same table as the server
const EQUIVALENCE_SURCHARGE_RATES_BPS: Record<number, number> = { 2_100: 520, 1_000: 140, 500: 62, 400: 50, 200: 26 };

export function getEquivalenceSurchargeRateBps({ taxRateBps }: { taxRateBps: number }) {
  return EQUIVALENCE_SURCHARGE_RATES_BPS[taxRateBps] ?? 0;
}

// What the customer actually pays the issuer: the total minus the IRPF withholding it pays to the tax agency instead
export function getInvoicePayableMinor({ totalMinor, withholdingMinor }: { totalMinor: number; withholdingMinor?: number }) {
  return totalMinor - (withholdingMinor ?? 0);
}
