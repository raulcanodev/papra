import { describe, expect, test } from 'vitest';
import { ASSISTANT_CATALOG_TOOLS, CATALOG_CONFIRMABLE_TOOL_SCHEMAS, createCatalogAssistantTools } from './catalog-tools';

function setup(responses: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const api = {
    request: async <T>(method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      const response = responses[`${method} ${path}`];

      if (response instanceof Error) {
        throw response;
      }

      return (response ?? {}) as T;
    },
  };

  return { calls, ...createCatalogAssistantTools({ context: { organizationId: 'org_1', api } }) };
}

const toolOptions = { toolCallId: 'call_1', messages: [] };

describe('catalog assistant tools', () => {
  test('tools the assistant already has natively are not offered twice', () => {
    const names = ASSISTANT_CATALOG_TOOLS.map(({ name }) => name);

    expect(names).not.to.include('list_tags');
    expect(names).not.to.include('list_documents');
    expect(names).to.include('create_invoice_draft');
  });

  test('read tools run immediately against the current organization', async () => {
    const { tools, calls } = setup({ 'GET /api/organizations/org_1/contacts?role=supplier': { contacts: [{ id: 'ctc_1' }] } });

    const result: unknown = await tools.list_contacts!.execute!({ role: 'supplier' }, toolOptions);

    expect(result).to.eql({ contacts: [{ id: 'ctc_1' }] });
    expect(calls).to.have.length(1);
  });

  test('a read tool failure goes back to the model as data so it can correct itself', async () => {
    const { tools } = setup({ 'GET /api/organizations/org_1/contacts/ctc_x': new Error('Contact not found.') });

    expect(await tools.get_contact!.execute!({ contactId: 'ctc_x' }, toolOptions)).to.eql({ success: false, error: 'Contact not found.' });
  });

  test('write and destructive tools only ask for approval, nothing is called', async () => {
    const { tools, calls } = setup();

    const result = await tools.delete_contact!.execute!({ contactId: 'ctc_1' }, toolOptions) as { requiresConfirmation: boolean; toolName: string; description: string };

    expect(result).to.include({ requiresConfirmation: true, toolName: 'delete_contact' });
    expect(result.description).to.include('cannot be undone');
    expect(calls).to.eql([]);
  });

  test('approving runs the executor, which reports failures instead of throwing', async () => {
    const { executors, calls } = setup({ 'DELETE /api/organizations/org_1/invoicing/invoices/inv_9': new Error('Only draft invoices can be deleted') });

    expect(await executors.create_contact!({ name: 'Acme', kind: 'company', currency: 'EUR', paymentTermsDays: 30, isCustomer: true, isSupplier: false, isSalesRepresentative: false })).to.include({ success: true });
    expect(calls[0]).to.include({ method: 'POST', path: '/api/organizations/org_1/contacts' });
    expect(await executors.delete_draft_invoice!({ invoiceId: 'inv_9' })).to.eql({ success: false, error: 'Only draft invoices can be deleted' });
  });

  test('what comes back from an approval card is validated with the tool schema', () => {
    const schema = CATALOG_CONFIRMABLE_TOOL_SCHEMAS.create_invoice_draft!;

    expect(schema.safeParse({ customerId: 'ctc_1', issueDate: 'tomorrow', dueDate: '2026-01-01', items: [] }).success).to.eql(false);
    expect(CATALOG_CONFIRMABLE_TOOL_SCHEMAS.list_contacts).to.eql(undefined);
  });
});
