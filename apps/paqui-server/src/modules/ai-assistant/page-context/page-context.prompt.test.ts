import { describe, expect, test } from 'vitest';
import { buildPageContextPrompt } from './page-context.prompt';
import { pageContextSchema } from './page-context.schemas';

const ORG = 'org_1';

function parse(input: unknown) {
  return pageContextSchema.parse(input);
}

describe('page context prompt', () => {
  test('without page context there is nothing to add', () => {
    expect(buildPageContextPrompt({ pageContext: undefined, organizationId: ORG })).to.eql('');
  });

  test('describes where the user is, what the page is for and the ids in the URL', () => {
    const prompt = buildPageContextPrompt({
      organizationId: ORG,
      pageContext: parse({
        path: '/organizations/org_1/sales/inv_9/edit',
        params: { organizationId: ORG, invoiceId: 'inv_9' },
        pages: [{ path: '/organizations/org_1/sales', label: 'Invoices', section: 'Invoicing' }],
      }),
    });

    expect(prompt).to.include('/organizations/org_1/sales/inv_9/edit');
    expect(prompt).to.include('invoiceId=inv_9');
    expect(prompt).not.to.include('organizationId=');
    expect(prompt).to.include('the invoices the organization issues');
  });

  test('renders what is on screen: tables, tabs and controls with their state', () => {
    const prompt = buildPageContextPrompt({
      organizationId: ORG,
      pageContext: parse({
        path: '/organizations/org_1/sales',
        snapshot: {
          headings: ['Invoices'],
          tabs: [{ label: 'Issued', active: true }, { label: 'Received', active: false }],
          tables: [{ columns: ['Number', 'Customer', 'Total'], rows: [['INV-0001', 'Acme', '121,00 €']], totalRows: 30 }],
          controls: [{ kind: 'button', label: 'New invoice' }, { kind: 'button', label: 'Export', disabled: true }],
        },
      }),
    });

    expect(prompt).to.include('[Issued] (selected) | Received');
    expect(prompt).to.include('30 rows, first 1 shown');
    expect(prompt).to.include('INV-0001 | Acme | 121,00 €');
    expect(prompt).to.include('button: New invoice');
    expect(prompt).to.include('button: Export (disabled)');
  });

  test('lists every page the user can open, marking the current one', () => {
    const prompt = buildPageContextPrompt({
      organizationId: ORG,
      pageContext: parse({
        path: '/organizations/org_1/taxes',
        pages: [
          { path: '/organizations/org_1/taxes', label: 'Quarterly taxes', section: 'Invoicing' },
          { path: '/organizations/org_1/calendar', label: 'Calendar' },
        ],
      }),
    });

    expect(prompt).to.include('Invoicing › Quarterly taxes: /organizations/org_1/taxes (current)');
    expect(prompt).to.include('- Calendar: /organizations/org_1/calendar');
  });

  test('leaves the decision to the model instead of dictating an answer', () => {
    const prompt = buildPageContextPrompt({ organizationId: ORG, pageContext: parse({ path: '/organizations/org_1/home' }) });

    expect(prompt).to.include('You are not following a script');
  });

  test('a huge page cannot blow up the prompt', () => {
    const prompt = buildPageContextPrompt({
      organizationId: ORG,
      pageContext: parse({ path: '/organizations/org_1/home', snapshot: { text: 'x'.repeat(1_500), controls: Array.from({ length: 60 }, (_, index) => ({ kind: 'button', label: `Button ${'y'.repeat(150)} ${index}` })) } }),
    });

    expect(prompt.length).toBeLessThanOrEqual(9_100);
  });
});

describe('screen data declared by the page', () => {
  test('gives the exact values of the record on screen and says the document comes with the message', () => {
    const prompt = buildPageContextPrompt({
      organizationId: ORG,
      pageContext: parse({
        path: '/organizations/org_1/purchases/new',
        screen: { subject: 'Purchase being registered', documentId: 'doc_1', data: { printedTotalMinor: 12100, form: { items: [{ unitPriceMinor: 10000 }] } } },
      }),
    });

    expect(prompt).to.include('### Purchase being registered: the data on screen right now');
    expect(prompt).to.include('documentId doc_1');
    expect(prompt).to.include('"printedTotalMinor":12100');
  });

  test('is kept whole even when the page itself is truncated', () => {
    const prompt = buildPageContextPrompt({
      organizationId: ORG,
      pageContext: parse({ path: '/organizations/org_1/home', snapshot: { text: 'x'.repeat(1_500), controls: Array.from({ length: 60 }, (_, index) => ({ kind: 'button', label: `Button ${'y'.repeat(150)} ${index}` })) }, screen: { subject: 'Purchase', data: { marker: 'kept' } } }),
    });

    expect(prompt).to.include('"marker":"kept"');
  });

  test('rejects screen data too large for the prompt', () => {
    expect(() => parse({ path: '/x', screen: { subject: 'Purchase', data: { text: 'x'.repeat(20_001) } } })).toThrow();
  });
});

describe('page context schema', () => {
  test('rejects a snapshot that is too large to be a page', () => {
    expect(() => parse({ path: '/x', snapshot: { controls: Array.from({ length: 61 }, () => ({ kind: 'button', label: 'a' })) } })).toThrow();
  });
});
