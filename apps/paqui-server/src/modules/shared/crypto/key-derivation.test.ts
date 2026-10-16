import { describe, expect, test } from 'vitest';
import { deriveKeyWithHkdf } from './key-derivation';

describe('key-derivation', () => {
  describe('deriveKeyWithHkdf', () => {
    test('deterministically derives a subkey from a key and an info', () => {
      const key = 'my-key';
      const info = 'paqui/v1:my-info';

      expect(deriveKeyWithHkdf({ key, info })).to.eql('AcsF1PRbTOA3OGIGBClaNHnQjYAzz8YkYlnbRDmjiwo');
    });
  });
});
