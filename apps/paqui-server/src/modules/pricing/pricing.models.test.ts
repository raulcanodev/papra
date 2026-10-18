import { describe, expect, test } from 'vitest';
import { getItemMargin, getItemShippingRateId } from './pricing.models';

describe('pricing models', () => {
  describe('getItemShippingRateId', () => {
    test('a line uses the shipping of its price list unless it overrides it, possibly with no shipping at all', () => {
      const priceList = { defaultShippingRateId: 'shr_list' };

      expect(getItemShippingRateId({ item: { overridesShipping: false, shippingRateId: 'shr_ignored' }, priceList })).to.eql('shr_list');
      expect(getItemShippingRateId({ item: { overridesShipping: true, shippingRateId: 'shr_own' }, priceList })).to.eql('shr_own');
      expect(getItemShippingRateId({ item: { overridesShipping: true, shippingRateId: null }, priceList })).to.eql(null);
    });
  });

  describe('getItemMargin', () => {
    test('the margin is the price minus the product cost and the shipping', () => {
      expect(getItemMargin({ priceMinor: 9_180, discountRateBps: 0, productCostMinor: 6_325, shippingMinor: 330 })).to.eql({
        netPriceMinor: 9_180,
        costMinor: 6_655,
        marginMinor: 2_525,
        marginRateBps: 2_751,
      });
    });

    test('the discount of the price list lowers the price the margin is computed on', () => {
      expect(getItemMargin({ priceMinor: 10_000, discountRateBps: 1_000, productCostMinor: 6_000, shippingMinor: 0 })).to.eql({
        netPriceMinor: 9_000,
        costMinor: 6_000,
        marginMinor: 3_000,
        marginRateBps: 3_333,
      });
    });

    test('a free line has no margin rate and a negative margin', () => {
      expect(getItemMargin({ priceMinor: 0, discountRateBps: 0, productCostMinor: 500, shippingMinor: 0 })).to.eql({ netPriceMinor: 0, costMinor: 500, marginMinor: -500, marginRateBps: null });
    });
  });
});
