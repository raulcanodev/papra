import { describe, expect, test } from 'vitest';
import { adjustPriceMinor, getNetPriceMinor, parseAmountToMinor } from './pricing.models';

describe('pricing models', () => {
  test('amounts are typed with a decimal comma or dot, thousands separators and the euro sign are tolerated', () => {
    expect(parseAmountToMinor('0,64')).to.eql(64);
    expect(parseAmountToMinor('16.75')).to.eql(1_675);
    expect(parseAmountToMinor('1.234,50 €')).to.eql(123_450);
    expect(parseAmountToMinor('')).to.eql(0);
    expect(parseAmountToMinor('abc')).to.eql(null);
    expect(parseAmountToMinor('-3')).to.eql(null);
  });

  test('the net price applies the price list discount', () => {
    expect(getNetPriceMinor({ priceMinor: 9_180, discountRateBps: 1_000 })).to.eql(8_262);
  });

  test('prices are adjusted by a percentage, never below zero', () => {
    expect(adjustPriceMinor({ priceMinor: 9_180, rateBps: 500 })).to.eql(9_639);
    expect(adjustPriceMinor({ priceMinor: 9_180, rateBps: -20_000 })).to.eql(0);
  });
});
