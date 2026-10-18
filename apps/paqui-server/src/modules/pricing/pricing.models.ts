import type { z } from 'zod';
import type { priceListItemsSchema, priceListSchema, productCostsSchema, shippingRateSchema } from './pricing.schemas';

export type ProductCostsInput = z.infer<typeof productCostsSchema>;
export type ShippingRateInput = z.infer<typeof shippingRateSchema>;
export type PriceListInput = z.infer<typeof priceListSchema>;
export type PriceListItemsInput = z.infer<typeof priceListItemsSchema>;

// The shipping rate a price list line uses: its own when it overrides it (null meaning no shipping), the list one otherwise
export function getItemShippingRateId({ item, priceList }: { item: { overridesShipping: boolean; shippingRateId: string | null }; priceList: { defaultShippingRateId: string | null } }) {
  return item.overridesShipping ? item.shippingRateId : priceList.defaultShippingRateId;
}

// What a price list line earns per unit: the price after the list discount minus the product cost and its shipping.
// Internal figures: they never leave the organization, the documents for a contact only show the price.
export function getItemMargin({ priceMinor, discountRateBps, productCostMinor, shippingMinor }: { priceMinor: number; discountRateBps: number; productCostMinor: number; shippingMinor: number }) {
  const netPriceMinor = priceMinor - Math.round(priceMinor * discountRateBps / 10_000);
  const costMinor = productCostMinor + shippingMinor;
  const marginMinor = netPriceMinor - costMinor;

  return {
    netPriceMinor,
    costMinor,
    marginMinor,
    // Share of the net price, null when there is no price to compare with
    marginRateBps: netPriceMinor === 0 ? null : Math.round(marginMinor * 10_000 / netPriceMinor),
  };
}
