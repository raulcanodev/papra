import type { Contact } from '../contacts/contacts.models';
import type { ExpenseCategory, PurchaseDocumentKind } from './purchases.constants';
import { z } from 'zod';
import { normalizeBankAccount, normalizeTaxId } from '../contacts/contacts.models';
import { PAYMENT_METHODS } from '../due-dates/due-dates.constants';
import { computeInstalments } from '../due-dates/due-dates.models';
import { calculateInvoiceTotals } from '../invoicing/invoicing.models';
import { EXPENSE_CATEGORIES, MAX_PURCHASE_METADATA_ENTRIES } from './purchases.constants';
import { toPurchaseUnitPrice } from './purchases.models';

// Bumped whenever the shape below changes, so a stored or cached reading can be told apart from a newer one
export const INVOICE_EXTRACTION_SCHEMA_VERSION = 4;

const partySchema = z.object({
  name: z.string().nullable().describe('Legal or trade name as printed, null when no name can be read (a logo alone, a torn header...)'),
  taxId: z.string().nullable().describe('Tax identification number (NIF, CIF, VAT number), exactly as printed, null when absent'),
  // Empty instead of null: Anthropic structured outputs accept at most 16 nullable fields per schema
  email: z.string().describe('Empty when absent'),
  phone: z.string().describe('Empty when absent'),
  addressLine1: z.string().describe('Empty when absent'),
  postalCode: z.string().describe('Empty when absent'),
  city: z.string().describe('Empty when absent'),
  country: z.string().describe('ISO 3166-1 alpha-2 country code, e.g. ES, empty when unknown'),
  bankAccount: z.string().describe('The IBAN (or other account number) where this party gets paid by bank transfer, as printed next to "IBAN", "Cuenta", "Nº de cuenta", "Transferencia a", "CCC". Usually the issuer\'s. A direct debit account (domiciliación) belongs to the recipient. Empty when absent'),
});

type ReadParty = z.infer<typeof partySchema>;
export type InvoiceParty = { [Key in keyof ReadParty]: string | null };

// Back to the null the rest of the app uses for what is not printed, the bank account written as the contacts keep it
export function normalizeReadParty({ party }: { party: ReadParty }): InvoiceParty {
  const normalized = Object.fromEntries(Object.entries(party).map(([key, value]) => [key, typeof value === 'string' && value.trim() === '' ? null : value])) as InvoiceParty;

  return { ...normalized, bankAccount: normalizeBankAccount({ bankAccount: normalized.bankAccount }) };
}

// What the model is asked to read from the paper, always this exact shape. Amounts as decimals in the document
// currency, converted to minor units by the server: models are much more reliable with "12.50" than with "1250 cents".
export const invoiceExtractionSchema = z.object({
  documentKind: z.enum(['invoice', 'simplified_invoice', 'delivery_note', 'receipt', 'other']).describe('invoice: full invoice (factura). simplified_invoice: ticket or simplified invoice (factura simplificada). delivery_note: albarán, goods delivered without being an invoice. receipt: payment receipt or card voucher. other: anything else'),
  issuer: partySchema.describe('The company or person that issued (sent) the document, usually at the top with its logo'),
  recipient: partySchema.describe('The company or person the document is addressed to'),
  number: z.string().nullable().describe('Document number (invoice number, delivery note number), null when not printed'),
  issueDate: z.string().nullable().describe('Issue date as YYYY-MM-DD, null when not printed'),
  dueDate: z.string().nullable().describe('Due date as YYYY-MM-DD, null when not printed. The first one when there are several'),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().describe('How the document says it is paid. transfer: bank transfer. direct_debit: direct debit or a bill the supplier charges to the bank account on the due date (domiciliación, recibo, giro, letra de cambio). promissory_note: promissory note (pagaré). card: card payment. cash: cash (contado, efectivo). other: anything else. null when not printed'),
  paymentTerms: z.array(z.object({
    date: z.string().nullable().describe('Due date as YYYY-MM-DD when a date is printed for it, null otherwise'),
    daysAfterIssue: z.number().nullable().describe('Days after the issue date when only terms are printed: 30 for "a 30 días", null when a date is printed'),
    amount: z.number().nullable().describe('Amount of this due date when printed, null when not'),
  })).describe('Every due date printed, in order: one entry per instalment. "Giro a 30 días" gives one entry with daysAfterIssue 30, "30/60/90 días" three entries (30, 60 and 90), a table of vencimientos one entry per row. Empty when the document says nothing about when to pay'),
  currency: z.string().describe('ISO 4217 currency code, e.g. EUR'),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number().describe('Quantity, 1 when not printed'),
    unitPrice: z.number().describe('Unit price before tax and before discount with every decimal printed (0.365, never rounded to the cent), 0 when not printed (delivery notes often have no prices). When the paper has both a price column and a rounded net price, take the precise one'),
    taxRatePercent: z.number().describe('VAT rate in percent, e.g. 21'),
    discountPercent: z.number().describe('Line discount in percent, 0 when none'),
  })),
  withholdingRatePercent: z.number().describe('IRPF withholding rate in percent, 0 when none'),
  total: z.number().nullable().describe('Total, taxes included, as printed, null when not printed'),
  category: z.enum(EXPENSE_CATEGORIES).describe('Best matching expense category for the recipient'),
  metadata: z.array(z.object({
    label: z.string().describe('Short name of the data, in the language of the document, e.g. "Forma de pago", "Pedido", "Albarán"'),
    value: z.string(),
  })).describe('Every other useful data printed that has no field above: order or delivery references, related delivery notes, delivery address, lot numbers, observations, signature... Never repeat a field above: the payment method and the IBAN or bank account have their own fields'),
  warnings: z.array(z.string()).describe('Short notes on what the reviewer has to check or correct: blurry or cut off parts, handwritten amounts, totals that do not add up. Not how a clear value was read, nor the small print. Empty when everything is clear'),
});

export type InvoiceExtraction = Omit<z.infer<typeof invoiceExtractionSchema>, 'issuer' | 'recipient'> & { issuer: InvoiceParty; recipient: InvoiceParty };

export type InvoiceDirection = 'received' | 'issued' | 'unknown';

// An invoice issued by the organization itself is a sale, not an expense: detected from the tax ids, then from the names
// when no tax id settles it (no fiscal profile yet, a tax id left off the paper)
export function getInvoiceDirection({ extraction, organizationTaxId, organizationNames = [] }: { extraction: Pick<InvoiceExtraction, 'issuer' | 'recipient'>; organizationTaxId: string | null | undefined; organizationNames?: (string | null | undefined)[] }): InvoiceDirection {
  const ownTaxId = normalizeTaxId({ taxId: organizationTaxId });

  if (ownTaxId !== null) {
    if (normalizeTaxId({ taxId: extraction.issuer.taxId }) === ownTaxId) {
      return 'issued';
    }

    if (normalizeTaxId({ taxId: extraction.recipient.taxId }) === ownTaxId) {
      return 'received';
    }
  }

  const ownNames = new Set(organizationNames.map(name => normalizeCompanyName({ name })).filter(name => name !== ''));
  const isIssuer = ownNames.has(normalizeCompanyName({ name: extraction.issuer.name }));
  const isRecipient = ownNames.has(normalizeCompanyName({ name: extraction.recipient.name }));

  if (isIssuer !== isRecipient) {
    return isIssuer ? 'issued' : 'received';
  }

  return 'unknown';
}

// Legal forms say nothing about who the company is: "Nube Hosting, S.L." and "NUBE HOSTING SL" are the same supplier
const LEGAL_FORM_TOKENS = new Set(['sl', 'slu', 'sll', 'sa', 'sau', 'slne', 'scoop', 'coop', 'sc', 'cb', 'scp', 'sociedad', 'limitada', 'anonima', 'unipersonal', 'ltd', 'llc', 'inc', 'gmbh', 'sarl', 'sas', 'srl', 'bv', 'nv', 'plc', 'co', 'cia', 'y', 'de', 'la', 'el', 'and', 'the']);

export function normalizeCompanyName({ name }: { name: string | null | undefined }) {
  if (name === null || name === undefined) {
    return '';
  }

  return name
    .normalize('NFD')
    // Combining marks: an accented letter is decomposed (NFD) as the letter and its accent
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // "S.L." and "S. L." become "sl" before splitting on the other punctuation
    .replace(/\b([a-z])\.\s?(?=[a-z]\.)/g, '$1')
    .replace(/\./g, '')
    .split(/[^a-z0-9]+/)
    .filter(token => token !== '' && !LEGAL_FORM_TOKENS.has(token))
    .join(' ');
}

function getBigrams(value: string) {
  const compact = value.replace(/ /g, '');
  return Array.from({ length: Math.max(compact.length - 1, 0) }, (_, index) => compact.slice(index, index + 2));
}

// Dice coefficient on character bigrams of the normalized names, 1 for the same name, 0 for nothing in common
export function getCompanyNameSimilarity({ a, b }: { a: string; b: string }) {
  const left = normalizeCompanyName({ name: a });
  const right = normalizeCompanyName({ name: b });

  if (left === '' || right === '') {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  // A trade name inside the legal name: "Nube" and "Nube Hosting Servicios"
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= 4 && ` ${longer} `.includes(` ${shorter} `)) {
    return 0.9;
  }

  const leftBigrams = getBigrams(left);
  const rightBigrams = getBigrams(right);
  const remaining = [...rightBigrams];
  const common = leftBigrams.filter((bigram) => {
    const index = remaining.indexOf(bigram);
    if (index === -1) {
      return false;
    }
    remaining.splice(index, 1);
    return true;
  }).length;

  return (2 * common) / (leftBigrams.length + rightBigrams.length || 1);
}

const SAME_NAME_SIMILARITY = 0.92;
const CANDIDATE_SIMILARITY = 0.6;
const MAX_CANDIDATES = 3;

type MatchableContact = Pick<Contact, 'id' | 'name' | 'taxId' | 'isSupplier'>;

// What the review screen proposes for the counterparty:
// - matched: an existing contact, found by tax id or, without tax id conflict, by the same name
// - create: a name was read but no contact has it, creating a supplier is suggested (with similar contacts to pick instead)
// - ask: nothing identifies the counterparty, the user is asked to pick a supplier or type a name once the rest is reviewed
export type SupplierResolution = {
  status: 'matched' | 'create' | 'ask';
  contactId: string | null;
  matchedBy: 'tax_id' | 'name' | null;
  hasSupplierRole: boolean;
  candidates: { contactId: string; name: string; taxId: string | null; isSupplier: boolean; similarity: number }[];
};

export function resolveSupplier({ party, contacts }: { party: Pick<InvoiceExtraction['issuer'], 'name' | 'taxId'>; contacts: MatchableContact[] }): SupplierResolution {
  const taxId = normalizeTaxId({ taxId: party.taxId });
  const hasName = normalizeCompanyName({ name: party.name }) !== '';

  const matched = (contact: MatchableContact, matchedBy: 'tax_id' | 'name'): SupplierResolution => ({ status: 'matched', contactId: contact.id, matchedBy, hasSupplierRole: contact.isSupplier, candidates: [] });

  const byTaxId = taxId === null ? undefined : contacts.find(contact => normalizeTaxId({ taxId: contact.taxId }) === taxId);
  if (byTaxId) {
    return matched(byTaxId, 'tax_id');
  }

  // Two different tax ids are two different companies, whatever their names
  const compatible = contacts.filter(contact => taxId === null || normalizeTaxId({ taxId: contact.taxId }) === null);
  const scored = hasName
    ? compatible
        .map(contact => ({ contact, similarity: getCompanyNameSimilarity({ a: party.name!, b: contact.name }) }))
        .filter(({ similarity }) => similarity >= CANDIDATE_SIMILARITY)
        // Suppliers first on a tie: a received invoice most likely comes from one
        .toSorted((a, b) => b.similarity - a.similarity || Number(b.contact.isSupplier) - Number(a.contact.isSupplier))
    : [];

  const [best, second] = scored;
  if (best && best.similarity >= SAME_NAME_SIMILARITY && (second === undefined || second.similarity < SAME_NAME_SIMILARITY)) {
    return matched(best.contact, 'name');
  }

  return {
    status: hasName || taxId !== null ? 'create' : 'ask',
    contactId: null,
    matchedBy: null,
    hasSupplierRole: false,
    candidates: scored.slice(0, MAX_CANDIDATES).map(({ contact, similarity }) => ({ contactId: contact.id, name: contact.name, taxId: contact.taxId, isSupplier: contact.isSupplier, similarity: Math.round(similarity * 100) / 100 })),
  };
}

const DOCUMENT_KINDS: Record<InvoiceExtraction['documentKind'], PurchaseDocumentKind> = {
  invoice: 'invoice',
  simplified_invoice: 'simplified_invoice',
  // A card voucher or a payment receipt is booked like a ticket
  receipt: 'simplified_invoice',
  delivery_note: 'delivery_note',
  other: 'invoice',
};

const toMinor = (amount: number) => Math.round(amount * 100);
const toBps = (percent: number, { max = 100 }: { max?: number } = {}) => Math.round(Math.min(Math.max(percent, 0), max) * 100);
const clean = (value: string, maxLength: number) => value.trim().replace(/\s+/g, ' ').slice(0, maxLength);

function toDate(value: string | null) {
  if (value === null) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

// Converts what the model read into a purchase draft, the user reviews it before saving.
// The due dates are the printed ones, or computed from the printed terms and the issue date, or from the supplier
// usual payment terms when the document says nothing (contactTermsDays, null for an unknown supplier).
export function toPurchaseInvoiceDraft({ extraction, supplierId, documentId, contactTermsDays = null }: { extraction: InvoiceExtraction; supplierId: string | null; documentId: string; contactTermsDays?: number | null }) {
  const items = extraction.lines
    .filter(line => line.description.trim() !== '' || line.unitPrice !== 0)
    .map(line => ({
      description: clean(line.description, 500) || '—',
      quantityMillis: Math.max(1, Math.round(line.quantity * 1_000)),
      ...toPurchaseUnitPrice({ amount: line.unitPrice }),
      taxRateBps: toBps(line.taxRatePercent),
      discountRateBps: toBps(line.discountPercent),
      deductibleRateBps: 10_000,
    }));

  const metadata = extraction.metadata
    .map(entry => ({ label: clean(entry.label, 200), value: clean(entry.value, 2_000) }))
    .filter(entry => entry.label !== '' && entry.value !== '')
    .slice(0, MAX_PURCHASE_METADATA_ENTRIES);

  const kind = DOCUMENT_KINDS[extraction.documentKind];
  const issueDate = toDate(extraction.issueDate);
  const withholdingRateBps = toBps(extraction.withholdingRatePercent, { max: 50 });
  const { totalMinor, withholdingMinor } = calculateInvoiceTotals({ items, withholdingRateBps });
  // Older readings (and models) may not have the payment fields
  const printedDueDates = (extraction.paymentTerms ?? []).map(term => ({ date: toDate(term.date), daysAfterIssue: term.daysAfterIssue === null ? null : Math.round(term.daysAfterIssue), amountMinor: term.amount === null ? null : toMinor(term.amount) }));
  const { instalments, source: instalmentsSource } = issueDate === null || kind === 'delivery_note'
    ? { instalments: [], source: 'none' as const }
    : computeInstalments({ issueDate, payableMinor: totalMinor - withholdingMinor, printedDueDates, dueDate: toDate(extraction.dueDate), contactTermsDays });

  return {
    supplierId,
    kind,
    number: clean(extraction.number ?? '', 100),
    issueDate,
    dueDate: instalments[0]?.dueDate ?? toDate(extraction.dueDate),
    paymentMethod: extraction.paymentMethod ?? null,
    instalments,
    instalmentsSource,
    currency: /^[A-Z]{3}$/i.test(extraction.currency) ? extraction.currency.toUpperCase() : 'EUR',
    category: extraction.category satisfies ExpenseCategory,
    // Same bound as the purchase draft validation
    withholdingRateBps,
    documentId,
    metadata,
    items,
  };
}
