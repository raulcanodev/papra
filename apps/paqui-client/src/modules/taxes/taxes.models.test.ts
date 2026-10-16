import { describe, expect, test } from 'vitest';
import { getDaysUntil, getDefaultTaxPeriod } from './taxes.models';

describe('taxes models', () => {
  test('during the month after a quarter, the quarter being filed is shown, the current one otherwise', () => {
    expect(getDefaultTaxPeriod({ now: new Date(2026, 9, 14) })).toEqual({ year: 2026, quarter: 3 });
    expect(getDefaultTaxPeriod({ now: new Date(2027, 0, 10) })).toEqual({ year: 2026, quarter: 4 });
    expect(getDefaultTaxPeriod({ now: new Date(2026, 10, 2) })).toEqual({ year: 2026, quarter: 4 });
    expect(getDefaultTaxPeriod({ now: new Date(2026, 1, 15) })).toEqual({ year: 2026, quarter: 1 });
  });

  test('days left until a deadline, from the start of today', () => {
    expect(getDaysUntil({ date: new Date('2026-10-20T00:00:00.000Z'), now: new Date(2026, 9, 14, 18, 30) })).toBe(6);
    expect(getDaysUntil({ date: new Date('2026-10-14T00:00:00.000Z'), now: new Date(2026, 9, 14, 9) })).toBe(0);
  });
});
