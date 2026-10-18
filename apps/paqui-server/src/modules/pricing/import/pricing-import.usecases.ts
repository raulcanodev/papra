import type { Sheet } from '../../ai-assistant/attachments/spreadsheet.parsers';
import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import type { AiSheetLayout, ConfirmPricingImportInput } from './pricing-import.schemas';
import type { PricingImportProposal, SheetLayout } from './pricing-import.types';
import { generateObject } from 'ai';
import { and, eq, isNull } from 'drizzle-orm';
import { getAiModel, isAiConfigured } from '../../ai-assistant/ai-assistant.providers';
import { getDocumentReadingStrategy } from '../../ai-assistant/attachments/attachments.models';
import { decodeText, getDocumentForAssistantOrThrow, loadDocumentFile } from '../../ai-assistant/attachments/attachments.usecases';
import { parseCsv, parseXlsx } from '../../ai-assistant/attachments/spreadsheet.parsers';
import { AI_FEATURES } from '../../ai-usage/ai-usage.constants';
import { createInvoicingRepository } from '../../invoicing/invoicing.repository';
import { productSchema } from '../../invoicing/invoicing.schemas';
import { invoicingProductsTable } from '../../invoicing/invoicing.tables';
import { createLogger } from '../../shared/logger/logger';
import { createPricingRepository } from '../pricing.repository';
import { MAX_IMPORT_FILE_BYTES, MAX_MODEL_COLUMNS, MAX_MODEL_ROWS } from './pricing-import.constants';
import { createPricingImportUnreadableError } from './pricing-import.errors';
import { detectLayoutWithRules, findMatchingProduct, formatSheetForModel, getColumnIndexFromLetter, readBlocks, sanitizeLayout } from './pricing-import.models';
import { aiSheetLayoutSchema } from './pricing-import.schemas';

const logger = createLogger({ namespace: 'pricing:import' });

export type LayoutDetector = (args: { sheets: Sheet[] }) => Promise<SheetLayout[]>;

const LAYOUT_INSTRUCTIONS = `You read spreadsheets where a company works out the cost and the selling price of its products, and describe where things are. You never copy figures: the application reads them from the cells you point to.

A sheet can hold several blocks, one under the other. A block starts with a header row naming one product per column (often with a label like "Model:" in its first cell). Sometimes a second row right under it names a variant of each product (a finish, a size, a material); a merged header then only shows the product name in the first of its columns.
Under the header, a column holds the row labels, and each row gives a figure per product column:
- cost_line: a component of the cost of making or buying the product (materials, parts, labour, packaging...).
- shipping: what delivering the product costs (carriage, freight, transport, courier...).
- commission: what selling it costs: a sales agent, representative or commission.
- total_cost: the row adding the lines above it.
- selling_price: the price the product is sold at.
- margin: the profit, price minus cost.
- ignore: anything else (percentages, notes, intermediate figures).
Labels can be in any language and wording, the company decides them. Use the position and the figures too: the total cost is usually the sum of the lines above it, the margin the price minus the cost.
Give every row of figures of every block, with the sheet name, row numbers and column letters exactly as shown. A spreadsheet with no such blocks has an empty list.`;

export function createAiLayoutDetector({ config, db, organizationId }: { config: Config; db: Database; organizationId: string }): LayoutDetector {
  return async ({ sheets }) => {
    const { object } = await generateObject({
      model: getAiModel({ config, db, feature: AI_FEATURES.PRICING_IMPORT, organizationId }),
      schema: aiSheetLayoutSchema,
      system: LAYOUT_INSTRUCTIONS,
      messages: [{ role: 'user', content: sheets.map(sheet => formatSheetForModel({ sheet, maxRows: MAX_MODEL_ROWS, maxColumns: MAX_MODEL_COLUMNS })).join('\n\n') }],
    });

    return toSheetLayouts({ layout: object, sheets });
  };
}

export function toSheetLayouts({ layout, sheets }: { layout: AiSheetLayout; sheets: Sheet[] }): SheetLayout[] {
  return sheets.map(sheet => ({
    sheetName: sheet.name,
    blocks: layout.blocks
      .filter(block => block.sheetName === sheet.name || sheets.length === 1)
      .map(({ sheetName: _sheetName, labelColumn, productColumns, ...block }) => ({
        ...block,
        labelColumn: getColumnIndexFromLetter(labelColumn),
        productColumns: productColumns.map(getColumnIndexFromLetter),
      })),
  }));
}

async function readSheets({ db, documentsStorageService, organizationId, documentId }: { db: Database; documentsStorageService: DocumentStorageService; organizationId: string; documentId: string }) {
  const { document } = await getDocumentForAssistantOrThrow({ db, organizationId, documentId });
  const strategy = getDocumentReadingStrategy({ mimeType: document.mimeType, name: document.name });

  if ((strategy !== 'xlsx' && strategy !== 'csv') || document.originalSize > MAX_IMPORT_FILE_BYTES) {
    throw createPricingImportUnreadableError();
  }

  try {
    const data = await loadDocumentFile({ document, documentsStorageService });
    const sheets = strategy === 'xlsx' ? await parseXlsx({ data }) : parseCsv({ text: decodeText({ data }) });
    return { document, sheets: sheets.filter(sheet => sheet.rows.length > 0) };
  } catch (error) {
    logger.warn({ error, documentId }, 'Pricing import file could not be read');
    throw createPricingImportUnreadableError();
  }
}

// Reads the spreadsheet and proposes what to create: nothing is saved until the user confirms the proposal
export async function analyzePricingImport({
  db,
  config,
  documentsStorageService,
  organizationId,
  documentId,
  detectLayout = isAiConfigured({ config }) ? createAiLayoutDetector({ config, db, organizationId }) : undefined,
}: {
  db: Database;
  config: Config;
  documentsStorageService: DocumentStorageService;
  organizationId: string;
  documentId: string;
  detectLayout?: LayoutDetector;
}): Promise<PricingImportProposal> {
  const { document, sheets } = await readSheets({ db, documentsStorageService, organizationId, documentId });
  const warnings: PricingImportProposal['warnings'] = [];

  if (sheets.some(sheet => sheet.rows.length > MAX_MODEL_ROWS)) {
    warnings.push('rows_truncated');
  }

  // The model finds the blocks whatever the wording; the rules only know a few common words, in case it is not there
  let layouts: SheetLayout[] | undefined;
  if (detectLayout) {
    try {
      layouts = (await detectLayout({ sheets })).map(layout => sanitizeLayout({ sheet: sheets.find(sheet => sheet.name === layout.sheetName) ?? { name: layout.sheetName, rows: [] }, layout }));
    } catch (error) {
      logger.warn({ error, documentId }, 'Pricing import layout could not be detected by the model');
      warnings.push('ai_failed');
    }
  } else {
    warnings.push('ai_not_configured');
  }

  const detectedWith = layouts?.some(layout => layout.blocks.length > 0) === true ? 'ai' : 'rules';
  const finalLayouts = detectedWith === 'ai' ? layouts! : sheets.map(sheet => detectLayoutWithRules({ sheet }));

  const blocks = finalLayouts.flatMap((layout, sheetIndex) => {
    const sheet = sheets.find(candidate => candidate.name === layout.sheetName);
    return sheet ? readBlocks({ sheet, layout, blockIdPrefix: sheets.length > 1 ? `s${sheetIndex + 1}b` : 'b' }) : [];
  });

  const pricingRepository = createPricingRepository({ db });
  const [catalog, { shippingRates }, { priceLists }] = await Promise.all([
    db.select({ id: invoicingProductsTable.id, name: invoicingProductsTable.name })
      .from(invoicingProductsTable)
      .where(and(eq(invoicingProductsTable.organizationId, organizationId), isNull(invoicingProductsTable.contactId), isNull(invoicingProductsTable.archivedAt))),
    pricingRepository.listShippingRates({ organizationId }),
    pricingRepository.listPriceLists({ organizationId }),
  ]);

  return {
    fileName: document.name,
    detectedWith,
    warnings,
    blocks: blocks.map(block => ({
      ...block,
      products: block.products.map(product => ({ ...product, matchedProduct: findMatchingProduct({ products: catalog, ...product }) })),
    })),
    shippingRates: shippingRates.map(({ id, name, amountMinor }) => ({ id, name, amountMinor })),
    priceLists: priceLists.map(({ id, name, isDefault }) => ({ id, name, isDefault })),
  };
}

// Everything is saved at once: products, their cost breakdowns, the shipping rates and the price list
export async function confirmPricingImport({ db, organizationId, input }: { db: Database; organizationId: string; input: ConfirmPricingImportInput }) {
  return db.transaction(async (tx) => {
    const pricingRepository = createPricingRepository({ db: tx });
    const invoicingRepository = createInvoicingRepository({ db: tx });
    const { shippingRates: existingRates } = await pricingRepository.listShippingRates({ organizationId });
    const rates = existingRates.map(({ id, name, amountMinor }) => ({ id, name, amountMinor }));

    let createdProductsCount = 0;
    let updatedProductsCount = 0;
    let createdShippingRatesCount = 0;
    const items: Array<{ productId: string; priceMinor: number; overridesShipping: boolean; shippingRateId: string | null }> = [];

    for (const product of input.products) {
      const productId = product.productId ?? (await invoicingRepository.createProduct({ organizationId, product: productSchema.parse({ name: product.name, unitPriceMinor: product.priceMinor ?? 0 }) })).product.id;

      if (product.productId === null) {
        createdProductsCount += 1;
      } else {
        updatedProductsCount += 1;
      }

      if (product.costLines.length > 0) {
        await pricingRepository.saveProductCosts({ organizationId, productId, costs: { lines: product.costLines } });
      }

      if (product.priceMinor === null || input.priceList === null) {
        continue;
      }

      let shippingRateId: string | null = null;
      if (product.shipping !== null) {
        // One rate per concept and amount (rates are shown with their amount), shared by the products shipped at that
        // price and found again on the next import
        const { name, amountMinor } = product.shipping;
        let rate = rates.find(candidate => candidate.amountMinor === amountMinor && candidate.name.toLowerCase() === name.toLowerCase());
        if (!rate) {
          const { shippingRate } = await pricingRepository.createShippingRate({ organizationId, shippingRate: { name, amountMinor, carrierContactId: null, notes: null } });
          rate = { id: shippingRate.id, name: shippingRate.name, amountMinor: shippingRate.amountMinor };
          rates.push(rate);
          createdShippingRatesCount += 1;
        }
        shippingRateId = rate.id;
      }

      items.push({ productId, priceMinor: product.priceMinor, overridesShipping: shippingRateId !== null, shippingRateId });
    }

    if (input.priceList === null) {
      return { priceListId: null, createdProductsCount, updatedProductsCount, createdShippingRatesCount };
    }

    let priceListId: string;
    let keptItems: typeof items = [];
    if (input.priceList.mode === 'new') {
      const { priceLists } = await pricingRepository.listPriceLists({ organizationId });
      // The first price list is the default one, like when it is created by hand
      const { priceList } = await pricingRepository.createPriceList({ organizationId, priceList: { name: input.priceList.name, description: null, discountRateBps: 0, defaultShippingRateId: null, isDefault: priceLists.length === 0 } });
      priceListId = priceList.id;
    } else {
      // The imported products get their new price, the others of the list stay as they were
      const { priceList } = await pricingRepository.getPriceList({ organizationId, priceListId: input.priceList.priceListId });
      priceListId = priceList.id;
      const importedIds = new Set(items.map(item => item.productId));
      keptItems = priceList.items.filter(item => !importedIds.has(item.productId)).map(({ productId, priceMinor, overridesShipping, shippingRateId }) => ({ productId, priceMinor, overridesShipping, shippingRateId }));
    }

    // The same product twice in the file keeps its last price
    const uniqueItems = [...new Map([...keptItems, ...items].map(item => [item.productId, item])).values()];
    await pricingRepository.savePriceListItems({ organizationId, priceListId, items: uniqueItems });

    return { priceListId, createdProductsCount, updatedProductsCount, createdShippingRatesCount };
  });
}
