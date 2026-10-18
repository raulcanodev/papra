import { describe, expect, test } from 'vitest';
import { getReturnHref, isAppPath, withReturnTo } from './return-to.models';

describe('return to', () => {
  describe('isAppPath', () => {
    test('only a path of this app is accepted', () => {
      expect(isAppPath('/organizations/org_1/contacts/customers/c_1?tab=products')).toBe(true);
      expect(isAppPath('https://example.com')).toBe(false);
      expect(isAppPath('//example.com')).toBe(false);
      expect(isAppPath('/\\example.com')).toBe(false);
      expect(isAppPath('organizations/org_1')).toBe(false);
      expect(isAppPath(undefined)).toBe(false);
      expect(isAppPath(['/a', '/b'])).toBe(false);
    });
  });

  describe('withReturnTo', () => {
    test('the origin, with its own search, is added to the link', () => {
      const href = withReturnTo({ href: '/organizations/org_1/sales/inv_1/edit', returnTo: '/organizations/org_1/contacts/c_1?tab=invoices' });

      expect(href).toBe('/organizations/org_1/sales/inv_1/edit?from=%2Forganizations%2Forg_1%2Fcontacts%2Fc_1%3Ftab%3Dinvoices');
      expect(new URLSearchParams(href.split('?')[1]).get('from')).toBe('/organizations/org_1/contacts/c_1?tab=invoices');
    });

    test('the search the link already has is kept', () => {
      expect(withReturnTo({ href: '/organizations/org_1/purchases/new?documentId=doc_1', returnTo: '/organizations/org_1/documents/doc_1' }))
        .toBe('/organizations/org_1/purchases/new?documentId=doc_1&from=%2Forganizations%2Forg_1%2Fdocuments%2Fdoc_1');
    });
  });

  describe('getReturnHref', () => {
    test('the origin wins over the fallback, unless it is not a path of this app', () => {
      expect(getReturnHref({ searchParam: '/organizations/org_1/calendar', fallback: '/organizations/org_1/sales' })).toBe('/organizations/org_1/calendar');
      expect(getReturnHref({ searchParam: 'https://example.com', fallback: '/organizations/org_1/sales' })).toBe('/organizations/org_1/sales');
      expect(getReturnHref({ searchParam: undefined, fallback: '/organizations/org_1/sales' })).toBe('/organizations/org_1/sales');
    });
  });
});
