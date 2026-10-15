import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, segment, withoutUndefined, withQuery } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { amountToMinor, bpsToPercent, minorToAmount, percentToBps, quantityToMillis } from '../units';
import { amountSchema, currencySchema, idSchema, isoDateSchema, percentSchema, READ_ONLY_NOTE } from './schemas';

const EXPENSE_CATEGORIES = ['goods', 'supplies', 'rent', 'professional_services', 'software', 'marketing', 'travel', 'vehicle', 'insurance', 'bank_fees', 'taxes_and_fees', 'other'] as const;

const purchaseLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000).default(1),
  unitPrice: amountSchema('Unit price WITHOUT tax.'),
  taxRatePercent: percentSchema('VAT rate of the line.').default(21),
  discountPercent: percentSchema('Discount on the line.').default(0),
  deductiblePercent: percentSchema('Share of the expense that is deductible for tax purposes (100 unless it is partly personal, e.g. a vehicle).').default(100),
});

type PurchaseLine = z.infer<typeof purchaseLineSchema>;

const PURCHASE_DOCUMENT_KINDS = ['invoice', 'simplified_invoice', 'delivery_note'] as const;

const metadataEntrySchema = z.object({
  label: z.string().trim().min(1).max(200).describe('Short name of the data as printed, e.g. "Forma de pago", "Pedido", "IBAN"'),
  value: z.string().trim().min(1).max(2_000),
});

type MetadataEntry = z.infer<typeof metadataEntrySchema>;

const purchaseFields = {
  supplierId: idSchema('Contact ID of the supplier (use search_workspace or list_contacts with role supplier)'),
  number: z.string().trim().min(1).max(100).describe('Invoice number printed by the supplier'),
  kind: z.enum(PURCHASE_DOCUMENT_KINDS).describe('invoice (factura), simplified_invoice (ticket) or delivery_note (albarán: goods received, does not count for VAT nor income tax until its invoice arrives)'),
  metadata: z.array(metadataEntrySchema).max(50).describe('Data printed on the paper that has no field of its own (payment method, IBAN, order or delivery references, observations...)'),
  issueDate: isoDateSchema('Date on the supplier invoice'),
  dueDate: isoDateSchema('Payment due date').nullable().optional(),
  items: z.array(purchaseLineSchema).min(1).max(200),
  currency: currencySchema,
  category: z.enum(EXPENSE_CATEGORIES).describe('Expense category the accountant books it under'),
  withholdingPercent: percentSchema('IRPF withholding the supplier applied (professionals/landlords), 0 if none.'),
  notes: z.string().trim().max(5_000).nullable().optional(),
  documentId: z.string().trim().min(1).nullable().optional().describe('ID of the uploaded document (PDF/image) of the invoice, to keep it attached'),
};

type StoredPurchaseItem = { description: string; quantityMillis: number; unitPriceMinor: number; taxRateBps: number; discountRateBps: number; deductibleRateBps: number };

type StoredPurchase = {
  supplierId: string;
  number: string;
  kind?: (typeof PURCHASE_DOCUMENT_KINDS)[number];
  metadata?: MetadataEntry[];
  issueDate: string;
  dueDate: string | null;
  currency: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  withholdingRateBps: number;
  notes: string | null;
  documentId: string | null;
  items: StoredPurchaseItem[];
};

function toApiItem(line: PurchaseLine) {
  return {
    description: line.description,
    quantityMillis: quantityToMillis(line.quantity),
    unitPriceMinor: amountToMinor(line.unitPrice),
    taxRateBps: percentToBps(line.taxRatePercent),
    discountRateBps: percentToBps(line.discountPercent),
    deductibleRateBps: percentToBps(line.deductiblePercent),
  };
}

function fromApiItem(item: StoredPurchaseItem): PurchaseLine {
  return {
    description: item.description,
    quantity: item.quantityMillis / 1_000,
    unitPrice: minorToAmount(item.unitPriceMinor),
    taxRatePercent: bpsToPercent(item.taxRateBps),
    discountPercent: bpsToPercent(item.discountRateBps),
    deductiblePercent: bpsToPercent(item.deductibleRateBps),
  };
}

type PurchaseDraft = { supplierId: string; number: string; kind?: (typeof PURCHASE_DOCUMENT_KINDS)[number]; metadata?: MetadataEntry[]; issueDate: string; dueDate?: string | null; items: PurchaseLine[]; currency: string; category: (typeof EXPENSE_CATEGORIES)[number]; withholdingPercent: number; notes?: string | null; documentId?: string | null };

function toPurchaseBody(draft: PurchaseDraft) {
  return {
    supplierId: draft.supplierId,
    number: draft.number,
    kind: draft.kind,
    metadata: draft.metadata,
    issueDate: draft.issueDate,
    dueDate: draft.dueDate,
    currency: draft.currency,
    category: draft.category,
    withholdingRateBps: percentToBps(draft.withholdingPercent),
    notes: draft.notes,
    documentId: draft.documentId,
    items: draft.items.map(toApiItem),
  };
}

const purchaseIdInput = { purchaseInvoiceId: idSchema('Received invoice ID') };
const purchasePath = (organizationId: string, purchaseInvoiceId: string, suffix = '') => organizationPath(organizationId, `/purchases/${segment(purchaseInvoiceId)}${suffix}`);

export const purchaseTools = [
  defineOrganizationTool({
    name: 'list_purchase_invoices',
    title: 'List received invoices',
    description: `List invoices RECEIVED from suppliers (facturas recibidas / gastos), newest first. Filter by status and by issue date range. ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.PURCHASES.READ,
    input: {
      status: z.enum(['pending', 'paid']).optional(),
      from: isoDateSchema('Issue date from (inclusive)').optional(),
      to: isoDateSchema('Issue date to (exclusive)').optional(),
    },
    run: ({ status, from, to }, { api, organizationId }) => api.request('GET', withQuery(organizationPath(organizationId, '/purchases'), { status, from, to })),
  }),
  defineOrganizationTool({
    name: 'get_purchase_invoice',
    title: 'Get received invoice',
    description: `Get one received invoice with its lines and supplier. ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.PURCHASES.READ,
    input: purchaseIdInput,
    run: ({ purchaseInvoiceId }, { api, organizationId }) => api.request('GET', purchasePath(organizationId, purchaseInvoiceId)),
  }),
  defineOrganizationTool({
    name: 'extract_purchase_from_document',
    title: 'Read a received invoice from a document',
    description: 'Use AI to read an uploaded PDF/image of a supplier invoice, ticket or delivery note and return a prefilled draft (kind, number, dates, lines, category, metadata with the extra printed data) and the supplier resolution: matched to an existing contact (by tax id or name), create (not a contact yet: create it with the data read), or ask (no name readable: ask the user). Nothing is saved: review it and then call create_purchase_invoice.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.PURCHASES.CREATE,
    input: { documentId: idSchema('Document ID of the invoice file') },
    run: ({ documentId }, { api, organizationId }) => api.request('POST', organizationPath(organizationId, '/purchases/extract'), { documentId }),
  }),
  defineOrganizationTool({
    name: 'create_purchase_invoice',
    title: 'Create received invoice',
    description: 'Register an invoice received from a supplier (a deductible expense). The supplier must already exist as a contact: create it first if needed. Amounts in euros, rates in percent.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.PURCHASES.CREATE,
    input: {
      ...purchaseFields,
      kind: purchaseFields.kind.default('invoice'),
      metadata: purchaseFields.metadata.default([]),
      currency: purchaseFields.currency.default('EUR'),
      category: purchaseFields.category.default('other'),
      withholdingPercent: purchaseFields.withholdingPercent.default(0),
    },
    run: (draft, { api, organizationId }) => api.request('POST', organizationPath(organizationId, '/purchases'), toPurchaseBody(draft)),
  }),
  defineOrganizationTool({
    name: 'update_purchase_invoice',
    title: 'Update received invoice',
    description: 'Change some fields of a received invoice. Only the fields you pass change; if you pass items they REPLACE all the lines.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.PURCHASES.UPDATE,
    input: {
      ...purchaseIdInput,
      supplierId: purchaseFields.supplierId.optional(),
      number: purchaseFields.number.optional(),
      kind: purchaseFields.kind.optional(),
      metadata: purchaseFields.metadata.optional().describe('Replaces all the extra data of the invoice'),
      issueDate: purchaseFields.issueDate.optional(),
      dueDate: purchaseFields.dueDate,
      items: purchaseFields.items.optional(),
      currency: purchaseFields.currency.optional(),
      category: purchaseFields.category.optional(),
      withholdingPercent: purchaseFields.withholdingPercent.optional(),
      notes: purchaseFields.notes,
      documentId: purchaseFields.documentId,
    },
    run: async ({ purchaseInvoiceId, ...changes }, { api, organizationId }) => {
      const { purchaseInvoice } = await api.request<{ purchaseInvoice: StoredPurchase }>('GET', purchasePath(organizationId, purchaseInvoiceId));

      const draft: PurchaseDraft = {
        supplierId: purchaseInvoice.supplierId,
        number: purchaseInvoice.number,
        kind: purchaseInvoice.kind,
        metadata: purchaseInvoice.metadata,
        issueDate: purchaseInvoice.issueDate,
        dueDate: purchaseInvoice.dueDate,
        currency: purchaseInvoice.currency,
        category: purchaseInvoice.category,
        withholdingPercent: bpsToPercent(purchaseInvoice.withholdingRateBps),
        notes: purchaseInvoice.notes,
        documentId: purchaseInvoice.documentId,
        items: purchaseInvoice.items.map(fromApiItem),
        ...withoutUndefined(changes),
      };

      return api.request('PUT', purchasePath(organizationId, purchaseInvoiceId), toPurchaseBody(draft));
    },
  }),
  defineOrganizationTool({
    name: 'set_purchase_invoice_status',
    title: 'Set received invoice status',
    description: 'Mark a received invoice as paid, or back to pending.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.PURCHASES.UPDATE,
    input: { ...purchaseIdInput, status: z.enum(['pending', 'paid']) },
    run: ({ purchaseInvoiceId, status }, { api, organizationId }) => api.request('PATCH', purchasePath(organizationId, purchaseInvoiceId, '/status'), { status }),
  }),
  defineOrganizationTool({
    name: 'delete_purchase_invoice',
    title: 'Delete received invoice',
    description: 'Permanently delete a received invoice. It disappears from the quarterly tax estimation.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.PURCHASES.DELETE,
    input: purchaseIdInput,
    run: ({ purchaseInvoiceId }, { api, organizationId }) => api.request('DELETE', purchasePath(organizationId, purchaseInvoiceId)),
  }),
];
