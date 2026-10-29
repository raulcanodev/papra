import type { PurchaseDocumentKind } from '../purchases.constants';
import { calculatePurchaseInvoiceTotals } from '../purchases.models';
import { isValidSpanishTaxId } from './spanish-tax-id.models';

export type ReadingCheckSeverity = 'error' | 'warning';

// A problem found on what the AI read, by code: the client words it, the assistant reads the code and params
export type ReadingCheck = {
  code:
    | 'total_mismatch'
    | 'missing_number'
    | 'missing_issue_date'
    | 'issue_date_in_future'
    | 'issue_date_too_old'
    | 'due_date_before_issue_date'
    | 'invalid_tax_id'
    | 'unusual_vat_rate'
    | 'no_lines'
    | 'lines_without_price'
    | 'supplier_not_identified'
    | 'issued_by_organization';
  severity: ReadingCheckSeverity;
  params?: Record<string, string | number>;
};

// IVA (0, 4, 5 temporary, 10, 21) and IGIC of the Canary Islands (3, 7, 9.5, 15, 20)
const KNOWN_VAT_RATES_BPS = [0, 300, 400, 500, 700, 950, 1_000, 1_500, 2_000, 2_100];
const MAX_INVOICE_AGE_YEARS = 6;
const DAY_MS = 24 * 60 * 60 * 1_000;

type ReadingForChecks = {
  direction: 'received' | 'issued' | 'unknown';
  draft: {
    kind: PurchaseDocumentKind;
    number: string;
    issueDate: Date | null;
    dueDate: Date | null;
    withholdingRateBps: number;
    items: { description: string; quantityMillis: number; unitPriceMinor: number; unitPriceMicros?: number | null; taxRateBps: number; discountRateBps: number; deductibleRateBps: number }[];
  };
  counterparty: { status: 'matched' | 'create' | 'ask'; taxId: string | null };
  printedTotal: number | null;
};

// Free, instant checks of what the AI read: arithmetic, dates, tax id control characters, what is missing.
// An error means the user must look before saving (status needs_review), a warning is shown but does not block.
export function checkPurchaseReading({ reading, now = new Date() }: { reading: ReadingForChecks; now?: Date }): ReadingCheck[] {
  const { draft, counterparty, printedTotal } = reading;
  const isDeliveryNote = draft.kind === 'delivery_note';
  const checks: ReadingCheck[] = [];
  const add = (code: ReadingCheck['code'], severity: ReadingCheckSeverity, params?: ReadingCheck['params']) => checks.push({ code, severity, ...(params ? { params } : {}) });

  if (reading.direction === 'issued') {
    add('issued_by_organization', 'error');
  }

  if (counterparty.status === 'ask') {
    add('supplier_not_identified', 'error');
  }

  if (counterparty.taxId !== null && isValidSpanishTaxId({ taxId: counterparty.taxId }) === false) {
    add('invalid_tax_id', 'error', { taxId: counterparty.taxId });
  }

  if (draft.number.trim() === '') {
    add('missing_number', isDeliveryNote ? 'warning' : 'error');
  }

  if (draft.issueDate === null) {
    add('missing_issue_date', 'error');
  } else {
    if (draft.issueDate.getTime() > now.getTime() + DAY_MS) {
      add('issue_date_in_future', 'error');
    }
    if (draft.issueDate.getTime() < now.getTime() - MAX_INVOICE_AGE_YEARS * 365 * DAY_MS) {
      add('issue_date_too_old', 'warning');
    }
    if (draft.dueDate !== null && draft.dueDate < draft.issueDate) {
      add('due_date_before_issue_date', 'warning');
    }
  }

  if (draft.items.length === 0) {
    add('no_lines', isDeliveryNote ? 'warning' : 'error');
    return checks;
  }

  const unusualRates = [...new Set(draft.items.map(item => item.taxRateBps).filter(rate => !KNOWN_VAT_RATES_BPS.includes(rate)))];
  if (unusualRates.length > 0) {
    add('unusual_vat_rate', 'warning', { rates: unusualRates.map(rate => `${rate / 100}%`).join(', ') });
  }

  // A delivery note often has no prices: nothing to add up
  if (!isDeliveryNote && draft.items.some(item => item.unitPriceMinor === 0)) {
    add('lines_without_price', 'warning');
  }

  if (printedTotal !== null && printedTotal > 0) {
    const totals = calculatePurchaseInvoiceTotals({ items: draft.items, withholdingRateBps: draft.withholdingRateBps });
    // The printed total can be before or after the withholding; one cent of rounding per line is tolerated
    const tolerance = Math.max(draft.items.length, 2);
    const matches = [totals.totalMinor, totals.totalMinor - totals.withholdingMinor].some(total => Math.abs(total - printedTotal) <= tolerance);

    if (!matches) {
      add('total_mismatch', 'error', { printedMinor: printedTotal, computedMinor: totals.totalMinor });
    }
  }

  return checks;
}

export function hasBlockingChecks({ checks }: { checks: ReadingCheck[] }) {
  return checks.some(check => check.severity === 'error');
}
