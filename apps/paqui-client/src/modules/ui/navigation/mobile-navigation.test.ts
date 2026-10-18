import { describe, expect, test } from 'vitest';
import { buildMobileMoreSections, getActiveMobileTab, getMobileTabs } from './mobile-navigation';

const withInvoicing = { 'invoicing': true, 'personal-finances': false };
const withoutInvoicing = { 'invoicing': false, 'personal-finances': false };
const translate = (key: string) => key;

describe('mobile navigation', () => {
  describe('getMobileTabs', () => {
    test('the bar shows home, purchases, invoices and more', () => {
      expect(getMobileTabs({ capabilities: withInvoicing }).map(({ routeId }) => routeId)).toEqual(['home', 'purchases', 'invoices', 'more']);
    });

    test('without invoicing the calendar takes the place of the invoices', () => {
      expect(getMobileTabs({ capabilities: withoutInvoicing }).map(({ routeId }) => routeId)).toEqual(['home', 'documents', 'calendar', 'more']);
    });
  });

  describe('getActiveMobileTab', () => {
    const tabs = getMobileTabs({ capabilities: withInvoicing });
    const getActive = (path: string) => getActiveMobileTab({ organizationId: 'org_1', pathname: `/organizations/org_1/${path}`, tabs });

    test('a tab is active on its page and on the pages under it', () => {
      expect(getActive('home')).toBe('home');
      expect(getActive('purchases')).toBe('purchases');
      expect(getActive('purchases/new')).toBe('purchases');
      expect(getActive('sales')).toBe('invoices');
      expect(getActive('sales/new')).toBe('invoices');
    });

    test('the pages without a tab belong to "more"', () => {
      expect(getActive('more')).toBe('more');
      expect(getActive('contacts/customers')).toBe('more');
      expect(getActive('taxes')).toBe('more');
      expect(getActive('documents')).toBe('more');
      expect(getActive('ai-assistant')).toBe('more');
    });

    test('the root of the organization is its home', () => {
      expect(getActiveMobileTab({ organizationId: 'org_1', pathname: '/organizations/org_1', tabs })).toBe('home');
      expect(getActiveMobileTab({ organizationId: 'org_1', pathname: '/organizations/org_1/', tabs })).toBe('home');
    });
  });

  describe('buildMobileMoreSections', () => {
    test('the "more" page lists the side menu without the entries of the bar', () => {
      const sections = buildMobileMoreSections({
        organizationId: 'org_1',
        capabilities: withInvoicing,
        translate,
        tabs: getMobileTabs({ capabilities: withInvoicing }),
      });

      const routeIds = sections.flatMap(section => section.items.map(item => item.id));

      expect(routeIds).toContain('calendar');
      expect(routeIds).toContain('customers');
      expect(routeIds).toContain('taxes');
      expect(routeIds).not.toContain('home');
      expect(routeIds).not.toContain('purchases');
      expect(routeIds).not.toContain('invoices');
    });

    test('the entries the member hid from the side menu stay hidden here too', () => {
      const sections = buildMobileMoreSections({
        organizationId: 'org_1',
        capabilities: withInvoicing,
        translate,
        hiddenItemIds: ['salesRepresentatives'],
        tabs: getMobileTabs({ capabilities: withInvoicing }),
      });

      expect(sections.flatMap(section => section.items.map(item => item.id))).not.toContain('salesRepresentatives');
    });
  });
});
