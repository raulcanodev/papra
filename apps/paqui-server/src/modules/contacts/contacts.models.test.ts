import { describe, expect, test } from 'vitest';
import { normalizeBankAccount } from './contacts.models';

describe('contacts models', () => {
  describe('normalizeBankAccount', () => {
    test('an IBAN is stored uppercase in groups of four, whatever the spaces, dashes or prefix it was written with', () => {
      expect(normalizeBankAccount({ bankAccount: 'es9121000418450200051332' })).to.eql('ES91 2100 0418 4502 0005 1332');
      expect(normalizeBankAccount({ bankAccount: ' ES91-2100-0418-4502-0005-1332 ' })).to.eql('ES91 2100 0418 4502 0005 1332');
      expect(normalizeBankAccount({ bankAccount: 'IBAN: ES91 2100 0418 4502 0005 1332' })).to.eql('ES91 2100 0418 4502 0005 1332');
      expect(normalizeBankAccount({ bankAccount: 'DE89370400440532013000' })).to.eql('DE89 3704 0044 0532 0130 00');
    });

    test('any other account number is kept as written, an empty one is none', () => {
      expect(normalizeBankAccount({ bankAccount: 'Routing 021000021  Account 1234567890' })).to.eql('Routing 021000021 Account 1234567890');
      expect(normalizeBankAccount({ bankAccount: '   ' })).to.eql(null);
      expect(normalizeBankAccount({ bankAccount: null })).to.eql(null);
      expect(normalizeBankAccount({ bankAccount: undefined })).to.eql(null);
    });
  });
});
