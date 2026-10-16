import { describe, expect, test } from 'vitest';
import { buildContainsPattern, filterKindsByPermissions, findMatchedField, parseSearchKinds, SEARCH_KINDS } from './search.models';

describe('search models', () => {
  describe('buildContainsPattern', () => {
    test('escapes the LIKE wildcards so the text is searched literally', () => {
      expect(buildContainsPattern({ query: ' 50%_off\\ ' })).to.eql('%50\\%\\_off\\\\%');
    });
  });

  describe('findMatchedField', () => {
    test('returns the first field that contains the text, ignoring case', () => {
      expect(findMatchedField({ query: 'ACME', fields: { name: 'Beta', email: 'info@acme.es', notes: 'acme friend' } })).to.eql('email');
      expect(findMatchedField({ query: 'zzz', fields: { name: 'Beta', email: null } })).to.eql(undefined);
    });
  });

  describe('parseSearchKinds', () => {
    test('searches every kind by default and ignores unknown ones', () => {
      expect(parseSearchKinds({ kinds: undefined })).to.eql([...SEARCH_KINDS]);
      expect(parseSearchKinds({ kinds: 'product, nope,contact' })).to.eql(['contact', 'product']);
    });
  });

  describe('filterKindsByPermissions', () => {
    test('a session keeps every kind', () => {
      expect(filterKindsByPermissions({ kinds: ['contact', 'invoice'], apiKeyPermissions: undefined })).to.eql(['contact', 'invoice']);
    });

    test('an API key only searches what it can read', () => {
      expect(filterKindsByPermissions({ kinds: [...SEARCH_KINDS], apiKeyPermissions: ['contacts:read', 'documents:read'] })).to.eql(['contact', 'document']);
    });
  });
});
