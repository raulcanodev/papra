import { describe, expect, test } from 'vitest';
import { buildPageContext } from './build-page-context';
import { matchPathTemplate } from './match-path-template';

describe('matchPathTemplate', () => {
  test('captures the parameters of a matching path', () => {
    expect(matchPathTemplate({ template: 'invoicing/invoices/:invoiceId/edit', path: 'invoicing/invoices/inv_1/edit' })).to.eql({ invoiceId: 'inv_1' });
  });

  test('is undefined for another page, even a similar one', () => {
    expect(matchPathTemplate({ template: 'invoicing/invoices/:invoiceId/edit', path: 'invoicing/invoices/received/new' })).to.eql(undefined);
    expect(matchPathTemplate({ template: 'invoicing/invoices/:invoiceId/edit', path: 'invoicing/invoices/inv_1' })).to.eql(undefined);
  });
});

describe('buildPageContext', () => {
  const menuSections = [
    { id: 'invoicing', label: 'Invoicing', items: [{ label: 'Invoices', icon: 'i', href: '/organizations/org_1/invoicing/invoices' }] },
    { id: 'contacts', label: 'Contacts', items: [{ label: 'Customers', icon: 'i', href: '/organizations/org_1/contacts/customers' }] },
  ];

  test('lists the pages of the menu with their section, so modules the organization lacks never appear', () => {
    const context = buildPageContext({ organizationId: 'org_1', pathname: '/organizations/org_1/home', menuSections });

    expect(context.pages).to.eql([
      { path: '/organizations/org_1/invoicing/invoices', label: 'Invoices', section: 'Invoicing' },
      { path: '/organizations/org_1/contacts/customers', label: 'Customers', section: 'Contacts' },
    ]);
  });

  test('knows the record on screen from the URL', () => {
    const context = buildPageContext({ organizationId: 'org_1', pathname: '/organizations/org_1/sales/inv_7/edit', menuSections });

    expect(context.params).to.eql({ invoiceId: 'inv_7' });
  });

  test('offers the pages that open one record with the organization already in the path', () => {
    const context = buildPageContext({ organizationId: 'org_1', pathname: '/organizations/org_1/home', menuSections });

    expect(context.entityPages).to.deep.include({ path: '/organizations/org_1/sales/:invoiceId/edit', label: 'Issued invoice editor' });
    expect(context.params).to.eql({});
  });

  test('drops an empty query string', () => {
    expect(buildPageContext({ organizationId: 'org_1', pathname: '/organizations/org_1/home', search: '', menuSections }).search).to.eql(undefined);
  });
});
