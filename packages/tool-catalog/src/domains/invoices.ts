import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, segment, withoutUndefined, withQuery } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { amountToMinor, bpsToPercent, minorToAmount, percentToBps, quantityToMillis } from '../units';
import { amountSchema, currencySchema, idSchema, isoDateSchema, optionalText, percentSchema, READ_ONLY_NOTE } from './schemas';

const INVOICE_STATUSES = ['draft', 'issuing', 'issued', 'sent', 'paid', 'void'] as const;

const invoiceLineSchema = z.object({
  productId: z.string().trim().min(1).nullable().optional().describe('Catalog product this line comes from, if any'),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000).default(1),
  unitPrice: amountSchema('Unit price WITHOUT tax.'),
  taxRatePercent: percentSchema('VAT rate of the line: 21 general, 10 reduced, 4 super reduced, 0 exempt.').default(21),
  discountPercent: percentSchema('Discount on the line.').default(0),
});

type InvoiceLine = z.infer<typeof invoiceLineSchema>;

const invoiceDraftFields = {
  customerId: idSchema('Contact ID of the customer (use search_workspace or list_contacts)'),
  issueDate: isoDateSchema('Invoice date'),
  dueDate: isoDateSchema('Payment due date, not before the issue date. Normally issue date + the customer paymentTermsDays.'),
  items: z.array(invoiceLineSchema).min(1).max(200),
  seriesId: z.string().trim().min(1).nullable().optional().describe('Numbering series ID (list_invoice_series). Omit for the default series.'),
  salesRepresentativeId: z.string().trim().min(1).nullable().optional().describe('Contact ID of the commercial that sold it'),
  currency: currencySchema,
  notes: optionalText(5_000),
  terms: optionalText(5_000),
  withholdingPercent: percentSchema('IRPF withholding applied to the invoice (professionals usually 15, 7 for new self-employed, 0 otherwise).'),
};

type StoredInvoiceItem = { productId: string | null; description: string; quantityMillis: number; unitPriceMinor: number; taxRateBps: number; discountRateBps: number };

type StoredInvoice = {
  customerId: string;
  seriesId: string | null;
  salesRepresentativeId: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  templateId: string;
  withholdingRateBps: number;
  items: StoredInvoiceItem[];
};

function toApiItem(line: InvoiceLine) {
  return {
    productId: line.productId ?? null,
    description: line.description,
    quantityMillis: quantityToMillis(line.quantity),
    unitPriceMinor: amountToMinor(line.unitPrice),
    taxRateBps: percentToBps(line.taxRatePercent),
    discountRateBps: percentToBps(line.discountPercent),
  };
}

function fromApiItem(item: StoredInvoiceItem): InvoiceLine {
  return {
    productId: item.productId,
    description: item.description,
    quantity: item.quantityMillis / 1_000,
    unitPrice: minorToAmount(item.unitPriceMinor),
    taxRatePercent: bpsToPercent(item.taxRateBps),
    discountPercent: bpsToPercent(item.discountRateBps),
  };
}

type DraftInput = { customerId: string; issueDate: string; dueDate: string; items: InvoiceLine[]; seriesId?: string | null; salesRepresentativeId?: string | null; currency: string; notes?: string | null; terms?: string | null; withholdingPercent: number; templateId?: string };

function toDraftBody(draft: DraftInput) {
  return {
    customerId: draft.customerId,
    seriesId: draft.seriesId,
    salesRepresentativeId: draft.salesRepresentativeId,
    issueDate: draft.issueDate,
    dueDate: draft.dueDate,
    currency: draft.currency,
    notes: draft.notes,
    terms: draft.terms,
    templateId: draft.templateId,
    withholdingRateBps: percentToBps(draft.withholdingPercent),
    items: draft.items.map(toApiItem),
  };
}

const invoiceIdInput = { invoiceId: idSchema('Invoice ID') };
const invoicePath = (organizationId: string, invoiceId: string, suffix = '') => organizationPath(organizationId, `/invoicing/invoices/${segment(invoiceId)}${suffix}`);

export const invoiceTools = [
  defineOrganizationTool({
    name: 'list_invoices',
    title: 'List invoices',
    description: `List issued-by-us invoices (facturas emitidas), newest first, with the customer name. Statuses: draft (editable, no number yet), issued (numbered, final), sent (emailed), paid, void. ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.INVOICES.READ,
    input: { status: z.enum(INVOICE_STATUSES).optional() },
    run: ({ status }, { api, organizationId }) => api.request('GET', withQuery(organizationPath(organizationId, '/invoicing/invoices'), { status })),
  }),
  defineOrganizationTool({
    name: 'get_invoice',
    title: 'Get invoice',
    description: `Get one invoice with its lines, customer, totals inputs and status. ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.INVOICES.READ,
    input: invoiceIdInput,
    run: ({ invoiceId }, { api, organizationId }) => api.request('GET', invoicePath(organizationId, invoiceId)),
  }),
  defineOrganizationTool({
    name: 'list_invoice_series',
    title: 'List invoice series',
    description: 'List the numbering series (e.g. INV-0001) invoices can be issued under, the default first.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.INVOICES.READ,
    run: (_input, { api, organizationId }) => api.request('GET', organizationPath(organizationId, '/invoicing/series')),
  }),
  defineOrganizationTool({
    name: 'create_invoice_draft',
    title: 'Create invoice draft',
    description: 'Create a DRAFT invoice. A draft has no number yet and can be edited or deleted freely; it becomes final only with issue_invoice. Amounts are in euros (not cents) and rates in percent. Resolve the customer first and use list_tax_rates / list_products for lines.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.INVOICES.CREATE,
    input: {
      ...invoiceDraftFields,
      currency: invoiceDraftFields.currency.default('EUR'),
      withholdingPercent: invoiceDraftFields.withholdingPercent.default(0),
    },
    run: (draft, { api, organizationId }) => api.request('POST', organizationPath(organizationId, '/invoicing/invoices'), toDraftBody(draft)),
  }),
  defineOrganizationTool({
    name: 'update_invoice_draft',
    title: 'Update invoice draft',
    description: 'Change a DRAFT invoice. Only the fields you pass change; if you pass items they REPLACE all the lines. Issued invoices cannot be edited (legal requirement): void or rectify them instead.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.INVOICES.UPDATE,
    input: {
      ...invoiceIdInput,
      customerId: invoiceDraftFields.customerId.optional(),
      issueDate: invoiceDraftFields.issueDate.optional(),
      dueDate: invoiceDraftFields.dueDate.optional(),
      items: invoiceDraftFields.items.optional(),
      seriesId: invoiceDraftFields.seriesId,
      salesRepresentativeId: invoiceDraftFields.salesRepresentativeId,
      currency: invoiceDraftFields.currency.optional(),
      notes: invoiceDraftFields.notes,
      terms: invoiceDraftFields.terms,
      withholdingPercent: invoiceDraftFields.withholdingPercent.optional(),
    },
    run: async ({ invoiceId, ...changes }, { api, organizationId }) => {
      const { invoice } = await api.request<{ invoice: StoredInvoice }>('GET', invoicePath(organizationId, invoiceId));

      const draft: DraftInput = {
        customerId: invoice.customerId,
        seriesId: invoice.seriesId,
        salesRepresentativeId: invoice.salesRepresentativeId,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency,
        notes: invoice.notes,
        terms: invoice.terms,
        templateId: invoice.templateId,
        withholdingPercent: bpsToPercent(invoice.withholdingRateBps),
        items: invoice.items.map(fromApiItem),
        ...withoutUndefined(changes),
      };

      return api.request('PUT', invoicePath(organizationId, invoiceId), toDraftBody(draft));
    },
  }),
  defineOrganizationTool({
    name: 'delete_draft_invoice',
    title: 'Delete draft invoice',
    description: 'Delete an invoice that is still a draft. Issued invoices cannot be deleted by law.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.INVOICES.DELETE,
    input: invoiceIdInput,
    run: ({ invoiceId }, { api, organizationId }) => api.request('DELETE', invoicePath(organizationId, invoiceId)),
  }),
  defineOrganizationTool({
    name: 'issue_invoice',
    title: 'Issue invoice',
    description: 'Make a draft FINAL: it gets the next number of its series, is archived as a PDF and registered for Verifactu when enabled. IRREVERSIBLE: an issued invoice can no longer be edited or deleted. Check customer, lines and dates with the user first.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.INVOICES.UPDATE,
    input: invoiceIdInput,
    run: ({ invoiceId }, { api, organizationId }) => api.request('POST', invoicePath(organizationId, invoiceId, '/issue')),
  }),
  defineOrganizationTool({
    name: 'send_invoice_email',
    title: 'Email invoice',
    description: 'Email the invoice PDF to the customer (issues it first if it is still a draft). The customer needs an email address. Sends a real email: confirm with the user.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.INVOICES.UPDATE,
    input: invoiceIdInput,
    run: ({ invoiceId }, { api, organizationId }) => api.request('POST', invoicePath(organizationId, invoiceId, '/send')),
  }),
  defineOrganizationTool({
    name: 'mark_invoice_paid',
    title: 'Mark invoice paid',
    description: 'Record that the customer has paid an issued invoice.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.INVOICES.UPDATE,
    input: invoiceIdInput,
    run: ({ invoiceId }, { api, organizationId }) => api.request('POST', invoicePath(organizationId, invoiceId, '/paid')),
  }),
];
