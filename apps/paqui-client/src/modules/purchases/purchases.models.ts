import type { PurchaseInvoiceItemInput } from './purchases.types';

// Mirrors the server purchases models: same rounding line by line, so the preview matches what is saved
export function calculatePurchaseInvoiceTotals({ items, withholdingRateBps }: { items: PurchaseInvoiceItemInput[]; withholdingRateBps: number }) {
  const totals = items.reduce((sums, item) => {
    const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
    const netMinor = gross - Math.round(gross * item.discountRateBps / 10_000);
    const taxMinor = Math.round(netMinor * item.taxRateBps / 10_000);

    return {
      subtotalMinor: sums.subtotalMinor + netMinor,
      taxMinor: sums.taxMinor + taxMinor,
      deductibleTaxMinor: sums.deductibleTaxMinor + Math.round(taxMinor * item.deductibleRateBps / 10_000),
    };
  }, { subtotalMinor: 0, taxMinor: 0, deductibleTaxMinor: 0 });

  const totalMinor = totals.subtotalMinor + totals.taxMinor;
  const withholdingMinor = Math.round(totals.subtotalMinor * withholdingRateBps / 10_000);

  return { ...totals, totalMinor, withholdingMinor, payableMinor: totalMinor - withholdingMinor };
}

export function emptyPurchaseInvoiceItem(taxRateBps = 2_100): PurchaseInvoiceItemInput {
  return { description: '', quantityMillis: 1_000, unitPriceMinor: 0, taxRateBps, discountRateBps: 0, deductibleRateBps: 10_000 };
}

export type TariffComparison = 'same' | 'higher' | 'lower' | 'not_comparable';

// The price charged on a line against the supplier's price list. A line at the list price with a discount, or at a
// discounted price equal to the list price, both match; a cent of rounding is not a difference.
export function compareLineWithTariff({ item, tariff, currency }: { item: Pick<PurchaseInvoiceItemInput, 'unitPriceMinor' | 'discountRateBps'>; tariff: { unitPriceMinor: number; currency: string }; currency: string }) {
  if (tariff.currency !== currency || item.unitPriceMinor <= 0) {
    return { comparison: 'not_comparable' as TariffComparison, chargedMinor: item.unitPriceMinor, differenceMinor: 0 };
  }

  const chargedMinor = Math.round(item.unitPriceMinor * (10_000 - item.discountRateBps) / 10_000);
  const isSame = [item.unitPriceMinor, chargedMinor].some(price => Math.abs(price - tariff.unitPriceMinor) <= 1);
  if (isSame) {
    return { comparison: 'same' as TariffComparison, chargedMinor, differenceMinor: 0 };
  }

  const differenceMinor = chargedMinor - tariff.unitPriceMinor;
  return { comparison: (differenceMinor > 0 ? 'higher' : 'lower') as TariffComparison, chargedMinor, differenceMinor };
}

const normalizePartyTaxId = (taxId: string | null | undefined) => (taxId ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
const LEGAL_FORMS = new Set(['sl', 'slu', 'sa', 'sau', 'slne', 'scoop', 'coop', 'cb', 'scp', 'sociedad', 'limitada', 'anonima', 'ltd', 'llc', 'inc', 'gmbh', 'srl', 'sas']);
const normalizePartyName = (name: string | null | undefined) => (name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\b([a-z])\.\s?(?=[a-z]\.)/g, '$1').replace(/\./g, '').split(/[^a-z0-9]+/).filter(token => token !== '' && !LEGAL_FORMS.has(token)).join(' ');

// The contact a party read on a paper is, by tax id first, by name otherwise (like the server does for the counterparty)
export function findPartyContact<T extends { name: string; taxId: string | null }>({ party, contacts }: { party: { name: string | null; taxId: string | null }; contacts: T[] }) {
  const taxId = normalizePartyTaxId(party.taxId);
  const byTaxId = taxId === '' ? undefined : contacts.find(contact => normalizePartyTaxId(contact.taxId) === taxId);
  if (byTaxId) {
    return byTaxId;
  }

  const name = normalizePartyName(party.name);
  return name === '' ? undefined : contacts.find(contact => normalizePartyName(contact.name) === name);
}
