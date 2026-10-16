import { describe, expect, test } from 'vitest';
import { checkPurchaseReading, hasBlockingChecks } from './document-readings.checks';
import { isValidSpanishTaxId } from './spanish-tax-id.models';

const now = new Date('2026-10-15T12:00:00.000Z');
const line = (overrides: Partial<{ quantityMillis: number; unitPriceMinor: number; taxRateBps: number }> = {}) => ({ description: 'Línea', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000, ...overrides });

function reading(overrides: { draft?: Record<string, unknown>; counterparty?: Record<string, unknown>; printedTotal?: number | null; direction?: 'received' | 'issued' | 'unknown' } = {}) {
  return {
    direction: overrides.direction ?? 'received',
    draft: { kind: 'invoice' as const, number: 'F-1', issueDate: new Date('2026-10-01'), dueDate: null, withholdingRateBps: 0, items: [line()], ...overrides.draft },
    counterparty: { status: 'matched' as const, taxId: 'B12345674', ...overrides.counterparty },
    printedTotal: overrides.printedTotal === undefined ? 12_100 : overrides.printedTotal,
  } as Parameters<typeof checkPurchaseReading>[0]['reading'];
}

describe('document readings checks', () => {
  test('spanish tax ids are validated by their control character, foreign ones are not judged', () => {
    expect(isValidSpanishTaxId({ taxId: '12345678Z' })).toBe(true);
    expect(isValidSpanishTaxId({ taxId: '12345678A' })).toBe(false);
    expect(isValidSpanishTaxId({ taxId: 'X1234567L' })).toBe(true);
    expect(isValidSpanishTaxId({ taxId: 'ES-B12345674' })).toBe(true);
    expect(isValidSpanishTaxId({ taxId: 'B12345675' })).toBe(false);
    expect(isValidSpanishTaxId({ taxId: 'Q2826000H' })).toBe(true);
    expect(isValidSpanishTaxId({ taxId: 'FR40303265045' })).toBe(null);
  });

  test('a clean reading passes, the printed total may be before or after the withholding', () => {
    expect(checkPurchaseReading({ reading: reading(), now })).toEqual([]);
    // 100 base + 21 VAT - 15 withholding = 106
    expect(checkPurchaseReading({ reading: reading({ draft: { withholdingRateBps: 1_500 }, printedTotal: 10_600 }), now })).toEqual([]);
  });

  test('lines that do not add up to the printed total block the reading', () => {
    const checks = checkPurchaseReading({ reading: reading({ printedTotal: 14_500 }), now });

    expect(checks).toEqual([{ code: 'total_mismatch', severity: 'error', params: { printedMinor: 14_500, computedMinor: 12_100 } }]);
    expect(hasBlockingChecks({ checks })).toBe(true);
  });

  test('a misread tax id, a missing supplier, number or date, and a future date are errors', () => {
    const checks = checkPurchaseReading({ reading: reading({ counterparty: { status: 'ask', taxId: 'B12345675' }, draft: { number: ' ', issueDate: new Date('2026-12-01') } }), now });

    expect(checks.map(check => [check.code, check.severity])).toEqual([
      ['supplier_not_identified', 'error'],
      ['invalid_tax_id', 'error'],
      ['missing_number', 'error'],
      ['issue_date_in_future', 'error'],
    ]);
  });

  test('a delivery note without prices nor number is fine, only warned', () => {
    const checks = checkPurchaseReading({ reading: reading({ draft: { kind: 'delivery_note', number: '', items: [line({ unitPriceMinor: 0 })] }, printedTotal: null }), now });

    expect(checks).toEqual([{ code: 'missing_number', severity: 'warning' }]);
    expect(hasBlockingChecks({ checks })).toBe(false);
  });

  test('unusual VAT rates and lines without price are warnings', () => {
    const checks = checkPurchaseReading({ reading: reading({ draft: { items: [line({ taxRateBps: 1_800 }), line({ unitPriceMinor: 0 })] }, printedTotal: null }), now });

    expect(checks).toEqual([
      { code: 'unusual_vat_rate', severity: 'warning', params: { rates: '18%' } },
      { code: 'lines_without_price', severity: 'warning' },
    ]);
  });
});
