import type { Contact } from '../../contacts/contacts.models';
import type { PurchaseDocumentKind } from '../purchases.constants';
import type { SupplierResolution } from '../purchases.extraction.models';
import type { ReadingCheck } from './document-readings.checks';
import type { DocumentReading } from './document-readings.repository';
import { resolveSupplier } from '../purchases.extraction.models';
import { checkPurchaseReading, hasBlockingChecks } from './document-readings.checks';

// What extractPurchaseInvoiceFromDocument returns, as stored in the reading (dates become ISO strings in the database)
export type StoredPurchaseExtraction = {
  schemaVersion: number;
  direction: 'received' | 'issued' | 'unknown';
  draft: {
    supplierId: string | null;
    kind: PurchaseDocumentKind;
    number: string;
    issueDate: string | Date | null;
    dueDate: string | Date | null;
    withholdingRateBps: number;
    items: { description: string; quantityMillis: number; unitPriceMinor: number; taxRateBps: number; discountRateBps: number; deductibleRateBps: number }[];
    [key: string]: unknown;
  };
  counterparty: SupplierResolution & { name: string | null; taxId: string | null; [key: string]: unknown };
  warnings: string[];
  printedTotal: number | null;
};

const toDate = (value: string | Date | null) => (value === null ? null : new Date(value));

// The status a finished reading deserves from its checks
export function getReadingStatusFromChecks({ checks }: { checks: ReadingCheck[] }) {
  return hasBlockingChecks({ checks }) ? 'needs_review' as const : 'ready' as const;
}

export function checkExtraction({ extraction, now = new Date() }: { extraction: StoredPurchaseExtraction; now?: Date }) {
  return checkPurchaseReading({
    reading: { ...extraction, draft: { ...extraction.draft, issueDate: toDate(extraction.draft.issueDate), dueDate: toDate(extraction.draft.dueDate) } },
    now,
  });
}

// A reading can be hours old: the supplier is matched again against today's contacts (created since, given the
// supplier role...) and the checks run again, both are instant. The AI is never called again for it.
export function refreshExtraction({ extraction, contacts, now = new Date() }: { extraction: StoredPurchaseExtraction; contacts: Pick<Contact, 'id' | 'name' | 'taxId' | 'isSupplier'>[]; now?: Date }) {
  const resolution = resolveSupplier({ party: extraction.counterparty, contacts });
  const refreshed: StoredPurchaseExtraction = {
    ...extraction,
    counterparty: { ...extraction.counterparty, ...resolution },
    draft: { ...extraction.draft, supplierId: resolution.status === 'matched' && resolution.hasSupplierRole ? resolution.contactId : null },
  };
  const checks = checkExtraction({ extraction: refreshed, now });

  return { extraction: refreshed, checks, status: getReadingStatusFromChecks({ checks }) };
}

export function formatReadingForApi({ reading, contacts, now = new Date() }: { reading: DocumentReading; contacts: Pick<Contact, 'id' | 'name' | 'taxId' | 'isSupplier'>[]; now?: Date }) {
  const base = { documentId: reading.documentId, errorCode: reading.errorCode, updatedAt: reading.updatedAt };
  const isRead = (reading.status === 'ready' || reading.status === 'needs_review') && reading.result !== null;

  if (!isRead) {
    return { ...base, status: reading.status, checks: [], extraction: null };
  }

  const { extraction, checks, status } = refreshExtraction({ extraction: reading.result as StoredPurchaseExtraction, contacts, now });

  return { ...base, status, checks, extraction };
}

// Retrying does not help when the file cannot be read or the AI is not set up: those fail at once
const NON_RETRYABLE_ERROR_CODES = ['purchase_invoice.document_not_extractable', 'document.not_found', 'ai_assistant.not_configured'];

export function getReadingErrorCode({ error }: { error: unknown }) {
  const code = (error as { code?: unknown } | undefined)?.code;
  const causeCode = (error as { cause?: { code?: unknown } } | undefined)?.cause?.code;

  if (typeof causeCode === 'string' && NON_RETRYABLE_ERROR_CODES.includes(causeCode)) {
    return causeCode;
  }

  return typeof code === 'string' ? code : 'document_reading.unexpected_error';
}

export function isRetryableReadingError({ errorCode }: { errorCode: string }) {
  return !NON_RETRYABLE_ERROR_CODES.includes(errorCode);
}
