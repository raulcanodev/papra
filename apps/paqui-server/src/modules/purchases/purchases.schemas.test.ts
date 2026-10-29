import { describe, expect, test } from 'vitest';
import { purchaseInvoiceDraftSchema } from './purchases.schemas';

function draft(overrides: Record<string, unknown> = {}) {
  return {
    supplierId: 'ctc_supplier',
    number: 'F-1',
    issueDate: '2026-10-29',
    dueDate: '2026-10-27',
    items: [{ description: 'Material', quantityMillis: 1_000, unitPriceMinor: 10_000 }],
    ...overrides,
  };
}

describe('purchase invoice draft schema', () => {
  test('rejects an earlier due date while the invoice is pending', () => {
    expect(purchaseInvoiceDraftSchema.safeParse(draft()).success).toBe(false);
  });

  test('accepts an earlier historical due date when every instalment is paid', () => {
    const result = purchaseInvoiceDraftSchema.safeParse(draft({
      instalments: [{ dueDate: '2026-10-27', amountMinor: 10_000, status: 'paid', paidAt: '2026-10-29' }],
    }));

    expect(result.success).toBe(true);
  });

  test('still rejects an earlier due date when one instalment remains pending', () => {
    const result = purchaseInvoiceDraftSchema.safeParse(draft({
      instalments: [
        { dueDate: '2026-10-27', amountMinor: 5_000, status: 'paid', paidAt: '2026-10-29' },
        { dueDate: '2026-11-27', amountMinor: 5_000, status: 'pending' },
      ],
    }));

    expect(result.success).toBe(false);
  });
});
