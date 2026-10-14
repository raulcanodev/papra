import type { ApiRequester } from './tool-definition';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { toolCatalog } from './catalog';
import { getTaxKnowledge, SPANISH_TAX_KNOWLEDGE, TAX_TOPICS } from './knowledge/spain-tax-knowledge';
import { API_KEY_PERMISSIONS_VALUES } from './permissions';

type RecordedCall = { method: string; path: string; body?: unknown };

function createFakeApi(responses: Record<string, unknown> = {}) {
  const calls: RecordedCall[] = [];

  return {
    calls,
    api: {
      request: async <T>(method: string, path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return (responses[`${method} ${path}`] ?? {}) as T;
      },
    } satisfies ApiRequester,
  };
}

function getTool(name: string) {
  const tool = toolCatalog.find(candidate => candidate.name === name);

  if (!tool) {
    throw new Error(`Unknown tool ${name}`);
  }

  return tool;
}

describe('toolCatalog', () => {
  test('tool names are unique snake_case identifiers', () => {
    const names = toolCatalog.map(tool => tool.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names.every(name => /^[a-z]+(?:_[a-z]+)*$/.test(name))).toBe(true);
  });

  test('every tool declares a known API key permission or none', () => {
    for (const tool of toolCatalog) {
      expect(tool.permission === null || API_KEY_PERMISSIONS_VALUES.includes(tool.permission)).toBe(true);
    }
  });

  test('every tool is documented for the model', () => {
    for (const tool of toolCatalog) {
      expect(tool.description.length).toBeGreaterThan(30);
    }
  });

  test('the model-facing input of organization tools never asks for the organization id', () => {
    for (const tool of toolCatalog.filter(candidate => candidate.scope === 'organization')) {
      expect(Object.keys(tool.input)).not.toContain('organizationId');
    }
  });

  test('every business entity can be created, edited and deleted', () => {
    const names = new Set(toolCatalog.map(tool => tool.name));

    for (const name of [
      'create_contact',
      'update_contact',
      'delete_contact',
      'create_product',
      'update_product',
      'delete_product',
      'create_tax_rate',
      'update_tax_rate',
      'delete_tax_rate',
      'create_invoice_draft',
      'update_invoice_draft',
      'delete_draft_invoice',
      'create_purchase_invoice',
      'update_purchase_invoice',
      'delete_purchase_invoice',
      'update_fiscal_profile',
      'search_workspace',
      'get_quarterly_taxes',
      'get_spanish_tax_reference',
      'get_calendar',
    ]) {
      expect(names.has(name), name).toBe(true);
    }
  });

  test('irreversible fiscal actions are flagged destructive', () => {
    expect(getTool('issue_invoice').risk).toBe('destructive');
    expect(getTool('send_invoice_email').risk).toBe('destructive');
    expect(getTool('delete_contact').risk).toBe('destructive');
  });

  test('read tools never use a write HTTP method', async () => {
    for (const tool of toolCatalog.filter(candidate => candidate.risk === 'read' && candidate.permission !== null)) {
      const { api, calls } = createFakeApi();
      const input = z.object(tool.input).safeParse({ query: 'acme', year: 2026, quarter: 1, documentId: 'doc_1', invoiceId: 'inv_1', purchaseInvoiceId: 'pinv_1', contactId: 'ctc_1' });
      const context = { api, organizationId: 'org_1' };

      await tool.run(input.success ? input.data : {}, context).catch(() => undefined);

      expect(calls.every(call => call.method === 'GET' || call.method === 'POST'), tool.name).toBe(true);
    }
  });
});

describe('contacts tools', () => {
  test('update_contact merges the changes over the stored contact', async () => {
    const { api, calls } = createFakeApi({
      'GET /api/organizations/org_1/contacts/ctc_1': { contact: { id: 'ctc_1', organizationId: 'org_1', kind: 'company', name: 'Acme', email: 'a@acme.es', taxId: 'B123', currency: 'EUR', paymentTermsDays: 30, isCustomer: true, isSupplier: false, isSalesRepresentative: false, createdAt: 'x' } },
    });

    await getTool('update_contact').run({ contactId: 'ctc_1', phone: '600', isSupplier: true }, { api, organizationId: 'org_1' });

    expect(calls[1]).toMatchObject({ method: 'PUT', path: '/api/organizations/org_1/contacts/ctc_1' });
    expect(calls[1]?.body).toMatchObject({ name: 'Acme', email: 'a@acme.es', phone: '600', isCustomer: true, isSupplier: true });
    expect(calls[1]?.body).not.toHaveProperty('organizationId');
  });
});

describe('invoice tools', () => {
  test('create_invoice_draft converts euros and percentages to API units', async () => {
    const { api, calls } = createFakeApi();

    await getTool('create_invoice_draft').run(
      { customerId: 'ctc_1', issueDate: '2026-03-01', dueDate: '2026-03-31', currency: 'EUR', withholdingPercent: 15, items: [{ description: 'Consulting', quantity: 2.5, unitPrice: 100.5, taxRatePercent: 21, discountPercent: 10 }] },
      { api, organizationId: 'org_1' },
    );

    expect(calls[0]?.path).toBe('/api/organizations/org_1/invoicing/invoices');
    expect(calls[0]?.body).toMatchObject({
      withholdingRateBps: 1_500,
      items: [{ quantityMillis: 2_500, unitPriceMinor: 10_050, taxRateBps: 2_100, discountRateBps: 1_000 }],
    });
  });

  test('update_invoice_draft keeps the stored lines when only a date changes', async () => {
    const { api, calls } = createFakeApi({
      'GET /api/organizations/org_1/invoicing/invoices/inv_1': {
        invoice: { customerId: 'ctc_1', seriesId: null, salesRepresentativeId: null, issueDate: '2026-03-01', dueDate: '2026-03-31', currency: 'EUR', notes: null, terms: null, templateId: 'minimal', withholdingRateBps: 0, items: [{ productId: null, description: 'Hosting', quantityMillis: 1_000, unitPriceMinor: 5_000, taxRateBps: 2_100, discountRateBps: 0 }] },
      },
    });

    await getTool('update_invoice_draft').run({ invoiceId: 'inv_1', dueDate: '2026-04-15' }, { api, organizationId: 'org_1' });

    expect(calls[1]).toMatchObject({ method: 'PUT' });
    expect(calls[1]?.body).toMatchObject({ dueDate: '2026-04-15', items: [{ description: 'Hosting', quantityMillis: 1_000, unitPriceMinor: 5_000, taxRateBps: 2_100 }] });
  });
});

describe('taxes tools', () => {
  test('get_quarterly_taxes passes a simulated purchase in API units', async () => {
    const { api, calls } = createFakeApi();

    await getTool('get_quarterly_taxes').run(
      { year: 2026, quarter: 2, simulatePurchase: { baseAmount: 1_000, taxRatePercent: 21, deductiblePercent: 50, category: 'vehicle' } },
      { api, organizationId: 'org_1' },
    );

    expect(calls[0]?.path).toBe('/api/organizations/org_1/taxes/2026/2?simulateBaseMinor=100000&simulateTaxRateBps=2100&simulateDeductibleRateBps=5000&simulateCategory=vehicle');
  });
});

describe('spanish tax knowledge', () => {
  test('every topic has an entry that says what to verify online', () => {
    for (const topic of TAX_TOPICS) {
      const entry = SPANISH_TAX_KNOWLEDGE.find(candidate => candidate.topic === topic);

      expect(entry, topic).toBeDefined();
      expect(entry?.verifyOnline.length, topic).toBeGreaterThan(0);
      expect(entry?.legalBasis.length, topic).toBeGreaterThan(0);
    }
  });

  test('returns only the requested topics', () => {
    const { entries } = getTaxKnowledge({ topics: ['iva'] });

    expect(entries.map(entry => entry.topic)).toEqual(['iva']);
  });

  test('tells the model to verify online and not to rely on the map alone', () => {
    expect(getTaxKnowledge().guidance.join(' ')).toContain('verify');
  });
});
