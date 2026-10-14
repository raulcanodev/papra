import type { Contact } from '../contacts/contacts.types';

export type PurchaseInvoiceStatus = 'pending' | 'paid';

export type ExpenseCategory = 'goods' | 'supplies' | 'rent' | 'professional_services' | 'software' | 'marketing' | 'travel' | 'vehicle' | 'insurance' | 'bank_fees' | 'taxes_and_fees' | 'other';

export type PurchaseInvoiceItemInput = {
  description: string;
  quantityMillis: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountRateBps: number;
  /** Part of the VAT that can be deducted, in basis points (10000 = all of it) */
  deductibleRateBps: number;
};

export type PurchaseInvoiceDraftInput = {
  supplierId: string;
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  category: ExpenseCategory;
  withholdingRateBps: number;
  notes: string | null;
  documentId: string | null;
  items: PurchaseInvoiceItemInput[];
};

export type PurchaseInvoice = Omit<PurchaseInvoiceDraftInput, 'items'> & {
  id: string;
  organizationId: string;
  status: PurchaseInvoiceStatus;
  subtotalMinor: number;
  taxMinor: number;
  deductibleTaxMinor: number;
  totalMinor: number;
  withholdingMinor: number;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  supplierName?: string;
  supplierTaxId?: string | null;
  supplier?: Contact | null;
  items?: (PurchaseInvoiceItemInput & { id: string; position: number })[];
};

export type InvoiceDirection = 'received' | 'issued' | 'unknown';

export type PurchaseInvoiceExtraction = {
  direction: InvoiceDirection;
  draft: Omit<PurchaseInvoiceDraftInput, 'supplierId' | 'issueDate' | 'notes'> & { supplierId: string | null; issueDate: Date | null };
  counterparty: {
    contactId: string | null;
    hasSupplierRole: boolean;
    name: string;
    taxId: string | null;
    email: string | null;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
  };
  printedTotal: number;
};
