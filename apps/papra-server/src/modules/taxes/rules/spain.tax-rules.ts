import type { TaxModel } from '../taxes.constants';

// Every Spanish tax figure the quarterly estimation uses, versioned by the year it applies from.
// Reviewed once a year (January, when the AEAT publishes its calendar): add an entry for the new year only when a rule
// changes, each value keeps the source it was checked against. Territorio común only (not Navarra nor País Vasco).
export type SpanishTaxRules = {
  /** First year these rules apply to */
  fromYear: number;
  incomeTax130: {
    /** Instalment rate on the year to date net income (art. 110 LIRPF) */
    rateBps: number;
    /** Difficult to justify expenses, direct simplified estimation only: rate on the net income and yearly cap */
    difficultExpensesRateBps: number;
    difficultExpensesYearlyCapMinor: number;
  };
  corporateTax202: {
    /** Instalment rate on the last corporate tax quota, "cuota" modality (art. 40.2 LIS) */
    quotaRateBps: number;
    /** Months (1 to 12) whose first 20 days are the filing windows */
    filingMonths: number[];
  };
  /** Last day of the filing window: day of the month following the quarter, the fourth quarter being special */
  quarterlyDeadlines: Record<Exclude<TaxModel, '202'>, { dayOfFollowingMonth: number; fourthQuarterDayOfJanuary: number }>;
  sources: { label: string; url: string }[];
};

export const SPANISH_TAX_RULES: SpanishTaxRules[] = [
  {
    fromYear: 2024,
    incomeTax130: {
      rateBps: 2_000,
      // 7% was an exception for 2023 only, back to 5% from 2024, still capped at 2.000 € a year
      difficultExpensesRateBps: 500,
      difficultExpensesYearlyCapMinor: 200_000,
    },
    corporateTax202: {
      quotaRateBps: 1_800,
      filingMonths: [4, 10, 12],
    },
    quarterlyDeadlines: {
      303: { dayOfFollowingMonth: 20, fourthQuarterDayOfJanuary: 30 },
      130: { dayOfFollowingMonth: 20, fourthQuarterDayOfJanuary: 30 },
      111: { dayOfFollowingMonth: 20, fourthQuarterDayOfJanuary: 20 },
      115: { dayOfFollowingMonth: 20, fourthQuarterDayOfJanuary: 20 },
    },
    sources: [
      { label: 'AEAT, modelo 130', url: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G601.shtml' },
      { label: 'AEAT, modelo 303', url: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G414.shtml' },
      { label: 'AEAT, modelo 202, instrucciones', url: 'https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/impuesto-sobre-sociedades/modelo-202-is-i_____resencia-territorio-fraccionado_/instrucciones/Instrucciones-para-2025.html' },
      { label: 'AEAT, calendario del contribuyente', url: 'https://sede.agenciatributaria.gob.es/Sede/calendario-contribuyente.html' },
    ],
  },
];

export function getSpanishTaxRules({ year }: { year: number }): SpanishTaxRules {
  const rules = SPANISH_TAX_RULES.filter(({ fromYear }) => fromYear <= year).toSorted((a, b) => b.fromYear - a.fromYear)[0];

  // Older years use the oldest known rules: the estimation is meant for the current year anyway
  return rules ?? SPANISH_TAX_RULES.toSorted((a, b) => a.fromYear - b.fromYear)[0]!;
}
