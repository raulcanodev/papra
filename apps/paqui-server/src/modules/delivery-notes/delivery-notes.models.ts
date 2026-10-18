import type { DeliveryNoteStatus } from './delivery-notes.constants';

export function getDeliveryNoteStatus({ invoiceId }: { invoiceId: string | null }): DeliveryNoteStatus {
  return invoiceId === null ? 'pending' : 'invoiced';
}

// The next number of the organization delivery notes, after the highest numeric one (typed, read on a pad or given)
export function formatNextDeliveryNoteNumber({ highestNumber }: { highestNumber: number }) {
  return String(highestNumber + 1).padStart(4, '0');
}

// Handwriting is read with its abbreviations and quirks: what was written is compared lowercase, without accents nor punctuation
export function normalizeWrittenText({ text }: { text: string }) {
  return text
    .normalize('NFD')
    // Combining marks: an accented letter is decomposed (NFD) as the letter and its accent, "ñ" ends up as "n"
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The products confirmed for a written text in past delivery notes, the most recent first: "tom pera" was "Tomate pera 5 kg"
export function buildWrittenTextAliases({ items }: { items: Array<{ writtenText: string | null; productId: string | null }> }) {
  const aliases = new Map<string, string>();

  for (const { writtenText, productId } of items) {
    const key = writtenText === null ? '' : normalizeWrittenText({ text: writtenText });

    if (key !== '' && productId !== null && !aliases.has(key)) {
      aliases.set(key, productId);
    }
  }

  return aliases;
}

type InvoicedDeliveryNote = {
  number: string | null;
  date: Date;
  items: Array<{ productId: string | null; description: string; quantityMillis: number }>;
};

type Pricing = {
  products: Array<{ id: string; unitPriceMinor: number; taxRateBps: number }>;
  // The customer price list: its prices and the discount it applies on every line
  priceList: { discountRateBps: number; prices: Array<{ productId: string; priceMinor: number }> } | null;
  defaultTaxRateBps: number;
};

// One invoice for several delivery notes of a customer. A delivery note has no prices: each product is priced now,
// from the customer price list or else the catalog, and the same product adds up on a single line. A line typed
// without a product gets no price, the user sets it on the draft invoice. The notes of the invoice list the delivery notes.
export function buildInvoiceFromDeliveryNotes({ deliveryNotes, pricing, formatDate }: { deliveryNotes: InvoicedDeliveryNote[]; pricing: Pricing; formatDate: (date: Date) => string }) {
  const sorted = deliveryNotes.toSorted((a, b) => a.date.getTime() - b.date.getTime());
  const lines = new Map<string, InvoicedDeliveryNote['items'][number]>();

  for (const item of sorted.flatMap(deliveryNote => deliveryNote.items)) {
    const key = item.productId ?? `text:${item.description.toLowerCase()}`;
    const line = lines.get(key);

    lines.set(key, line ? { ...line, quantityMillis: line.quantityMillis + item.quantityMillis } : { ...item });
  }

  const items = [...lines.values()].map(({ productId, description, quantityMillis }) => {
    const product = productId === null ? undefined : pricing.products.find(({ id }) => id === productId);
    const listPrice = product === undefined ? undefined : pricing.priceList?.prices.find(price => price.productId === product.id);

    return {
      productId: product === undefined ? null : product.id,
      description,
      quantityMillis,
      unitPriceMinor: listPrice?.priceMinor ?? product?.unitPriceMinor ?? 0,
      taxRateBps: product?.taxRateBps ?? pricing.defaultTaxRateBps,
      discountRateBps: listPrice === undefined || pricing.priceList === null ? 0 : pricing.priceList.discountRateBps,
    };
  });

  const references = sorted.map(deliveryNote => (deliveryNote.number === null ? formatDate(deliveryNote.date) : `${deliveryNote.number} (${formatDate(deliveryNote.date)})`));

  return { items, reference: references.join(', ') };
}
