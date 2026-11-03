import { describe, expect, test } from 'vitest';
import { formatDecimal, parseDecimal } from './decimal-field';

describe('decimal-field', () => {
  describe('parseDecimal', () => {
    test('a comma or a dot is the decimal separator, and the value is rounded to the decimals allowed', () => {
      expect(parseDecimal('2,35', { maxDecimals: 3 })).to.eql(2.35);
      expect(parseDecimal('2.35', { maxDecimals: 3 })).to.eql(2.35);
      expect(parseDecimal(' 1.234,5 ', { maxDecimals: 3 })).to.eql(1234.5);
      expect(parseDecimal('2,3456', { maxDecimals: 3 })).to.eql(2.346);
      expect(parseDecimal('12,505', { maxDecimals: 2 })).to.eql(12.51);
    });

    test('text being typed that is not a number yet is not read', () => {
      expect(parseDecimal('', { maxDecimals: 3 })).to.eql(null);
      expect(parseDecimal('abc', { maxDecimals: 3 })).to.eql(null);
      expect(parseDecimal('2,', { maxDecimals: 3 })).to.eql(2);
    });
  });

  describe('formatDecimal', () => {
    test('a decimal comma, no thousands separator and no trailing zeros', () => {
      expect(formatDecimal(2.35, { maxDecimals: 3 })).to.eql('2,35');
      expect(formatDecimal(1234.5, { maxDecimals: 3 })).to.eql('1234,5');
      expect(formatDecimal(3, { maxDecimals: 3 })).to.eql('3');
    });
  });
});
