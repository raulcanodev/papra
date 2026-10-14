import { z } from 'zod';

export function idSchema(description: string) {
  return z.string().trim().min(1).describe(description);
}

export function isoDateSchema(description: string) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/, 'Use ISO 8601, e.g. 2026-03-31').describe(description);
}

export const currencySchema = z.string().trim().length(3).describe('ISO 4217 currency code, e.g. EUR');

export const optionalText = (max = 500) => z.string().trim().max(max).nullable().optional();

export const percentSchema = (description: string) => z.number().min(0).max(100).describe(description);

// Money tools receive and give euros (or the document currency), never cents
export const amountSchema = (description: string) => z.number().min(0).max(10_000_000).describe(`${description} Amount in the document currency, not cents (e.g. 12.50).`);

export const READ_ONLY_NOTE = 'Amounts in the response are in minor units (cents), rates in basis points (2100 = 21%).';
