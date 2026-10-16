import { describe, expect, test } from 'vitest';
import { getClientModules, getGestoriaClientHref, getModuleFromPathname } from './gestorias.navigation';

describe('gestorias navigation', () => {
  describe('getClientModules', () => {
    test('the granted modules follow the menu order, whatever the order they were granted in', () => {
      expect(getClientModules({ client: { modules: ['taxes', 'invoices'] } })).to.eql(['invoices', 'taxes']);
    });
  });

  describe('getGestoriaClientHref', () => {
    test('a client opens on its first granted module', () => {
      expect(getGestoriaClientHref({ gestoriaId: 'gst_1', client: { organizationId: 'org_1', modules: ['taxes', 'purchases'] } })).to.eql('/gestoria/gst_1/clients/org_1/invoices/received');
    });

    test('a client without any module sends back to the home', () => {
      expect(getGestoriaClientHref({ gestoriaId: 'gst_1', client: { organizationId: 'org_1', modules: [] } })).to.eql('/gestoria/gst_1/home');
    });
  });

  describe('getModuleFromPathname', () => {
    test('the received invoices are not mistaken for the issued ones', () => {
      expect(getModuleFromPathname({ pathname: '/gestoria/gst_1/clients/org_1/invoices' })).to.eql('invoices');
      expect(getModuleFromPathname({ pathname: '/gestoria/gst_1/clients/org_1/invoices/received' })).to.eql('purchases');
      expect(getModuleFromPathname({ pathname: '/gestoria/gst_1/clients/org_1/taxes' })).to.eql('taxes');
    });

    test('outside of a client module there is none', () => {
      expect(getModuleFromPathname({ pathname: '/gestoria/gst_1/home' })).to.eql(undefined);
    });
  });
});
