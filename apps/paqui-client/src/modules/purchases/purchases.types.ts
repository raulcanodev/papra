import type { Contact } from '../contacts/contacts.types';
import type { InstalmentInput, InstalmentsSource, PaymentInstalment, PaymentMethod } from '../due-dates/due-dates.types';
import type { EntityIconColor } from '../ui/components/entity-icon.constants';

export type PurchaseInvoiceStatus = 'pending' | 'paid';

export type ExpenseCategory = 'goods' | 'supplies' | 'rent' | 'professional_services' | 'software' | 'marketing' | 'travel' | 'vehicle' | 'insurance' | 'bank_fees' | 'taxes_and_fees' | 'other';

export type PurchaseDocumentKind = 'invoice' | 'simplified_invoice' | 'delivery_note';

/** Data read on the paper that has no field of its own (payment method, order reference, IBAN...) */
export type PurchaseMetadataEntry = { label: string; value: string };

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
  kind: PurchaseDocumentKind;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  category: ExpenseCategory;
  withholdingRateBps: number;
  notes: string | null;
  documentId: string | null;
  metadata: PurchaseMetadataEntry[];
  items: PurchaseInvoiceItemInput[];
  paymentMethod?: PaymentMethod | null;
  /** The due dates as reviewed; the server computes one from the due date or the supplier terms when absent */
  instalments?: InstalmentInput[];
};

export type PurchaseInvoice = Omit<PurchaseInvoiceDraftInput, 'items' | 'instalments'> & {
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
  supplierIcon?: string | null;
  supplierIconColor?: EntityIconColor | null;
  supplierTaxId?: string | null;
  supplier?: Contact | null;
  items?: (PurchaseInvoiceItemInput & { id: string; position: number })[];
  instalments?: PaymentInstalment[];
};

export type InvoiceDirection = 'received' | 'issued' | 'unknown';

// matched: an existing contact (by tax id or by the same name), create: a name was read but no contact has it,
// ask: nothing identifies the counterparty, the user types its name or picks a supplier
export type SupplierResolutionStatus = 'matched' | 'create' | 'ask';

export type SupplierCandidate = { contactId: string; name: string; taxId: string | null; isSupplier: boolean; similarity: number };

export type ReadingCheckCode
  = | 'total_mismatch'
    | 'missing_number'
    | 'missing_issue_date'
    | 'issue_date_in_future'
    | 'issue_date_too_old'
    | 'due_date_before_issue_date'
    | 'invalid_tax_id'
    | 'unusual_vat_rate'
    | 'no_lines'
    | 'lines_without_price'
    | 'supplier_not_identified'
    | 'issued_by_organization';

/** A problem the server found on what the AI read: an error must be looked at before saving */
export type ReadingCheck = { code: ReadingCheckCode; severity: 'error' | 'warning'; params?: Record<string, string | number> };

export type PurchaseReadingStatus = 'pending' | 'reading' | 'ready' | 'needs_review' | 'failed';

/** The AI reading of an uploaded document, queued at upload and polled by the review screen */
export type PurchaseReading = {
  documentId: string;
  status: PurchaseReadingStatus;
  errorCode: string | null;
  checks: ReadingCheck[];
  extraction: PurchaseInvoiceExtraction | null;
};

export type PurchaseInvoiceExtraction = {
  schemaVersion: number;
  direction: InvoiceDirection;
  // Readings made before the due dates were read have no instalments
  draft: Omit<PurchaseInvoiceDraftInput, 'supplierId' | 'issueDate' | 'notes'> & { supplierId: string | null; issueDate: Date | null; instalmentsSource?: InstalmentsSource };
  counterparty: {
    status: SupplierResolutionStatus;
    contactId: string | null;
    matchedBy: 'tax_id' | 'name' | null;
    hasSupplierRole: boolean;
    candidates: SupplierCandidate[];
    name: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    /** Readings made before the bank account was read have none */
    bankAccount?: string | null;
  };
  warnings: string[];
  printedTotal: number | null;
  /** Both sides as read; readings made before they were sent have only the counterparty */
  issuer?: InvoiceReadParty;
  recipient?: InvoiceReadParty;
};

export type InvoiceReadParty = { name: string | null; taxId: string | null; email: string | null; phone: string | null; addressLine1: string | null; postalCode: string | null; city: string | null; country: string | null; bankAccount?: string | null };
