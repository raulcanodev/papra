import { describe, expect, test } from 'vitest';
import { hasGestoriaModule, normalizeGestoriaModules } from './gestorias.models';

describe('gestorias models', () => {
  describe('normalizeGestoriaModules', () => {
    test('unknown modules and duplicates are dropped, and the modules keep their canonical order', () => {
      expect(normalizeGestoriaModules({ modules: ['taxes', 'unknown', 'invoices', 'taxes'] })).to.eql(['invoices', 'taxes']);
    });

    test('no module gives no access', () => {
      expect(normalizeGestoriaModules({ modules: [] })).to.eql([]);
    });
  });

  describe('hasGestoriaModule', () => {
    test('a module is granted only when listed', () => {
      expect(hasGestoriaModule({ modules: ['invoices'], module: 'invoices' })).to.eql(true);
      expect(hasGestoriaModule({ modules: ['invoices'], module: 'purchases' })).to.eql(false);
    });
  });
});
