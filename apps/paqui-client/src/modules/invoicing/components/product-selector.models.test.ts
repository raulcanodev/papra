import type { InvoicingProduct } from '../invoicing.types';
import { describe, expect, test } from 'vitest';
import { hasExactProductName, rankProducts } from './product-selector.models';

function product(id: string, name: string, description: string | null = null): InvoicingProduct {
  return {
    id,
    organizationId: 'org_1',
    name,
    description,
    unit: 'unidad',
    unitPriceMinor: 1_000,
    currency: 'EUR',
    taxRateBps: 2_100,
    icon: null,
    iconColor: null,
    contactId: null,
    contactName: null,
    imageDocumentId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('product selector search', () => {
  const products = [
    product('1', 'Mesa auxiliar', 'REF-ME-02'),
    product('2', 'Mesita de noche', 'REF-ME-01'),
    product('3', 'Silla Ámbar', 'REF-SA-01'),
  ];

  test('ranks exact and prefix name matches ahead of other searchable fields', () => {
    expect(rankProducts(products, 'mesa').map(({ id }) => id)).toEqual(['1']);
    expect(rankProducts(products, 'ref me').map(({ id }) => id)).toEqual(['1', '2']);
  });

  test('ignores accents and case when deciding whether the product already exists', () => {
    expect(rankProducts(products, 'ambar').map(({ id }) => id)).toEqual(['3']);
    expect(hasExactProductName(products, 'silla ambar')).toBe(true);
    expect(hasExactProductName(products, 'silla nueva')).toBe(false);
  });
});
