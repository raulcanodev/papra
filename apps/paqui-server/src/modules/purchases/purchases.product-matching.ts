import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAiModel, isAiConfigured } from '../ai-assistant/ai-assistant.providers';
import { AI_FEATURES } from '../ai-usage/ai-usage.constants';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { createLogger } from '../shared/logger/logger';
import { MAX_PRODUCT_MATCHING_PRODUCTS } from './purchases.constants';

const logger = createLogger({ namespace: 'purchases:product-matching' });

export type MatchableProduct = { id: string; name: string; description: string | null; unit: string; unitPriceMinor: number; currency: string };

export type ProductMatch = { productId: string | null; matchedBy: 'name' | 'ai' | null };

/** Finds, for lines the names could not settle, which product each one is: the index of the line and the product id */
export type ProductMatcher = (args: { products: MatchableProduct[]; lines: { index: number; description: string }[] }) => Promise<{ index: number; productId: string | null }[]>;

const getWords = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

// A line is a product when it carries its whole name ("Folios A4 (caja de 2.500) - ref 88" is "Folios A4 (caja de 2.500)"),
// the longest name wins ("Tóner negro XL" before "Tóner negro"). Anything less certain is left to the model.
export function matchProductByName({ description, products }: { description: string; products: MatchableProduct[] }) {
  const lineWords = new Set(getWords(description));
  if (lineWords.size === 0) {
    return null;
  }

  const [best] = products
    .map(product => ({ product, words: getWords(product.name) }))
    .filter(({ words }) => words.length > 0 && words.every(word => lineWords.has(word)))
    .toSorted((a, b) => b.words.length - a.words.length);

  return best?.product ?? null;
}

const MATCHING_INSTRUCTIONS = `You compare the lines of an invoice a supplier sent with the products the company has saved for that supplier (its price list).
For each line, give the id of the product it is, or an empty string when it is none of them.
A line is a product only when it is the same item: the same thing in the same format, size, pack or variant. Abbreviations, references, codes, word order and spelling can differ ("Folio A4 80g cj2500" is "Folios A4 (caja de 2.500)").
A different size, pack, quality or variant is another product ("Tóner color" is not "Tóner negro", "caja de 500" is not "caja de 2.500"). Shipping, fees and discounts are not products unless one is saved as such.
When unsure, leave it empty: a wrong product makes the company think the supplier charged the wrong price.`;

const matchingResultSchema = z.object({
  lines: z.array(z.object({ line: z.number().int(), productId: z.string() })),
});

export function createAiProductMatcher({ config, db, organizationId, userId }: { config: Config; db: Database; organizationId: string; userId?: string }): ProductMatcher {
  return async ({ products, lines }) => {
    const { object } = await generateObject({
      model: getAiModel({ config, db, feature: AI_FEATURES.PURCHASE_PRODUCT_MATCHING, organizationId, userId }),
      schema: matchingResultSchema,
      system: MATCHING_INSTRUCTIONS,
      messages: [{
        role: 'user',
        content: [
          '### Products of the supplier (id | name | description | unit | price)',
          ...products.map(product => [product.id, product.name, product.description ?? '', product.unit, `${(product.unitPriceMinor / 100).toFixed(2)} ${product.currency}`].join(' | ')),
          '',
          '### Lines of the invoice (line | description)',
          ...lines.map(({ index, description }) => `${index} | ${description}`),
        ].join('\n'),
      }],
    });

    return object.lines.map(({ line, productId }) => ({ index: line, productId: productId.trim() || null }));
  };
}

// Which of the supplier's products each line of a purchase is: by name first, the model for what the names leave open.
// The comparison of prices is left to the screen, where the lines are edited.
export async function matchPurchaseLinesWithProducts({
  descriptions,
  products,
  matchWithModel,
}: {
  descriptions: string[];
  products: MatchableProduct[];
  matchWithModel?: ProductMatcher;
}): Promise<{ matches: ProductMatch[]; isModelUnavailable: boolean }> {
  const matches: ProductMatch[] = descriptions.map((description) => {
    const product = matchProductByName({ description, products });
    return product ? { productId: product.id, matchedBy: 'name' } : { productId: null, matchedBy: null };
  });

  const openLines = descriptions.flatMap((description, index) => (matches[index]?.productId === null && description.trim() !== '' ? [{ index, description }] : []));
  if (products.length === 0 || openLines.length === 0) {
    return { matches, isModelUnavailable: false };
  }

  if (!matchWithModel) {
    return { matches, isModelUnavailable: true };
  }

  try {
    const productIds = new Set(products.map(({ id }) => id));
    const openIndexes = new Set(openLines.map(({ index }) => index));
    const answers = await matchWithModel({ products, lines: openLines });

    // Only what was asked, and only products of this supplier: anything else the model makes up is dropped
    for (const { index, productId } of answers) {
      if (openIndexes.has(index) && productId !== null && productIds.has(productId)) {
        matches[index] = { productId, matchedBy: 'ai' };
      }
    }

    return { matches, isModelUnavailable: false };
  } catch (error) {
    logger.warn({ error }, 'Purchase lines could not be matched with the supplier products by the model');
    return { matches, isModelUnavailable: true };
  }
}

export async function matchPurchaseLinesWithSupplierProducts({ db, config, organizationId, userId, supplierId, descriptions }: { db: Database; config: Config; organizationId: string; userId?: string; supplierId: string; descriptions: string[] }) {
  const { products } = await createInvoicingRepository({ db }).listProducts({ organizationId, contactId: supplierId });

  return matchPurchaseLinesWithProducts({
    descriptions,
    products: products.slice(0, MAX_PRODUCT_MATCHING_PRODUCTS),
    matchWithModel: isAiConfigured({ config }) ? createAiProductMatcher({ config, db, organizationId, userId }) : undefined,
  });
}
