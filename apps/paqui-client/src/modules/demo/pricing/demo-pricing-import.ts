import type { PricingImportBlock, PricingImportInput, PricingImportProposal, PricingImportResult } from '../../pricing/import/pricing-import.types';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { documentStorage } from '../demo.storage';
import { getValues } from '../demo.storage.models';
import { getDemoPricingStorages, getPriceListOrFail, listShippingRates, savePriceList, saveProductCosts } from './demo-pricing';

type Stored = Record<string, any>;

// The demo has no model to read the file: whatever is uploaded, it answers with this sample sheet of two blocks.
// The second one does not add up (its total was typed over), so the preview shows how a flagged block looks.
const SAMPLE_BLOCKS: Array<Omit<PricingImportBlock, 'products'> & { products: Array<Omit<PricingImportBlock['products'][number], 'matchedProduct' | 'linesTotalMinor'>> }> = [
  {
    id: 'b1',
    sheetName: 'Escandallos',
    title: 'Lámparas',
    headerRow: 3,
    concepts: [
      { row: 5, name: 'Materiales', kind: 'cost' },
      { row: 6, name: 'Mano de obra', kind: 'cost' },
      { row: 7, name: 'Embalaje', kind: 'cost' },
      { row: 8, name: 'Porte', kind: 'shipping' },
      { row: 9, name: 'Comisión comercial', kind: 'commission' },
    ],
    products: [
      { key: 'b1-B', column: 'B', name: 'Lámpara Aro (Latón)', baseName: 'Lámpara Aro', variant: 'Latón', amounts: [3_400, 1_800, 350, 900, 600], costMinor: 7_050, priceMinor: 12_900, marginMinor: 5_850 },
      { key: 'b1-C', column: 'C', name: 'Lámpara Aro (Negro)', baseName: 'Lámpara Aro', variant: 'Negro', amounts: [3_100, 1_800, 350, 900, 550], costMinor: 6_700, priceMinor: 11_900, marginMinor: 5_200 },
      { key: 'b1-D', column: 'D', name: 'Aplique Nube', baseName: 'Aplique Nube', variant: null, amounts: [1_900, 1_200, 250, 600, 400], costMinor: 4_350, priceMinor: 7_900, marginMinor: 3_550 },
    ],
    issues: [],
    isBalanced: true,
  },
  {
    id: 'b2',
    sheetName: 'Escandallos',
    title: 'Mesas',
    headerRow: 13,
    concepts: [
      { row: 14, name: 'Tablero', kind: 'cost' },
      { row: 15, name: 'Patas', kind: 'cost' },
      { row: 16, name: 'Porte', kind: 'shipping' },
    ],
    products: [
      { key: 'b2-B', column: 'B', name: 'Mesa Roble', baseName: 'Mesa Roble', variant: null, amounts: [9_000, 3_500, 2_500], costMinor: 16_000, priceMinor: 29_900, marginMinor: 13_900 },
      { key: 'b2-C', column: 'C', name: 'Mesa Nogal', baseName: 'Mesa Nogal', variant: null, amounts: [11_000, 3_500, 2_500], costMinor: 17_000, priceMinor: 34_900, marginMinor: 17_900 },
    ],
    issues: [{ code: 'cost_mismatch', productKey: 'b2-B', expectedMinor: 16_000, actualMinor: 15_000 }],
    isBalanced: false,
  },
];

const normalize = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s\-_/·]+/g, ' ').replace(/[()]/g, '').trim();
const now = () => new Date().toISOString();

async function listCatalog(organizationId: string) {
  return (await getValues(getDemoPricingStorages().products)).filter(product => product.organizationId === organizationId && !product.contactId && !product.archivedAt);
}

async function buildSampleProposal({ organizationId, fileName }: { organizationId: string; fileName: string }): Promise<PricingImportProposal> {
  const catalog = await listCatalog(organizationId);
  const priceLists = (await getValues(getDemoPricingStorages().priceLists)).filter(priceList => priceList.organizationId === organizationId && !priceList.archivedAt);

  return {
    fileName,
    detectedWith: 'ai',
    warnings: ['demo_sample'],
    blocks: SAMPLE_BLOCKS.map(block => ({
      ...block,
      products: block.products.map((product) => {
        const match = catalog.find(candidate => normalize(candidate.name) === normalize(product.name));
        return { ...product, linesTotalMinor: product.amounts.reduce((total, amount) => total + amount, 0), matchedProduct: match ? { id: match.id, name: match.name } : null };
      }),
    })),
    shippingRates: (await listShippingRates(organizationId)).map(({ id, name, amountMinor }) => ({ id, name, amountMinor })),
    priceLists: priceLists.map(({ id, name, isDefault }) => ({ id, name, isDefault })),
  };
}

// Same rules as the server: products created or matched, breakdowns replaced, one shipping rate per concept and amount,
// and the price list created or merged (its other products kept)
async function confirmImport({ organizationId, input }: { organizationId: string; input: PricingImportInput }): Promise<PricingImportResult> {
  const storages = getDemoPricingStorages();
  const rates = (await listShippingRates(organizationId)).map(({ id, name, amountMinor }) => ({ id: id as string, name: name as string, amountMinor: amountMinor as number }));
  const items: Stored[] = [];
  let createdProductsCount = 0;
  let createdShippingRatesCount = 0;

  for (const product of input.products) {
    let productId = product.productId;
    if (productId === null) {
      productId = createId({ prefix: 'prd' });
      await storages.products.setItem(productId, { id: productId, organizationId, name: product.name, description: null, unit: 'unit', unitPriceMinor: product.priceMinor ?? 0, currency: 'EUR', taxRateBps: 2_100, icon: null, iconColor: null, contactId: null, imageDocumentId: null, archivedAt: null, createdAt: now(), updatedAt: now() });
      createdProductsCount += 1;
    }

    if (product.costLines.length > 0) {
      await saveProductCosts({ organizationId, productId, lines: product.costLines });
    }

    if (product.priceMinor === null || input.priceList === null) {
      continue;
    }

    let shippingRateId: string | null = null;
    if (product.shipping) {
      const { name, amountMinor } = product.shipping;
      let rate = rates.find(candidate => candidate.amountMinor === amountMinor && candidate.name.toLowerCase() === name.toLowerCase());
      if (!rate) {
        rate = { id: createId({ prefix: 'shr' }), name, amountMinor };
        await storages.shippingRates.setItem(rate.id, { ...rate, organizationId, carrierContactId: null, notes: null, archivedAt: null, createdAt: now(), updatedAt: now() });
        rates.push(rate);
        createdShippingRatesCount += 1;
      }
      shippingRateId = rate.id;
    }

    items.push({ productId, priceMinor: product.priceMinor, overridesShipping: shippingRateId !== null, shippingRateId });
  }

  const counts = { createdProductsCount, updatedProductsCount: input.products.length - createdProductsCount, createdShippingRatesCount };

  if (input.priceList === null) {
    return { priceListId: null, ...counts };
  }

  if (input.priceList.mode === 'new') {
    const hasPriceLists = (await getValues(storages.priceLists)).some(priceList => priceList.organizationId === organizationId && !priceList.archivedAt);
    const priceList = await savePriceList({ id: createId({ prefix: 'prl' }), organizationId, name: input.priceList.name, description: null, discountRateBps: 0, defaultShippingRateId: null, isDefault: !hasPriceLists, archivedAt: null, createdAt: now(), updatedAt: now(), items: [...new Map(items.map(item => [item.productId, item])).values()] });
    return { priceListId: priceList.id, ...counts };
  }

  const existing = await getPriceListOrFail(input.priceList.priceListId);
  const importedIds = new Set(items.map(item => item.productId));
  const merged = [...(existing.items as Stored[]).filter(item => !importedIds.has(item.productId)), ...items];
  await savePriceList({ ...existing, items: [...new Map(merged.map(item => [item.productId, item])).values()], updatedAt: now() });

  return { priceListId: existing.id, ...counts };
}

const base = '/api/organizations/:organizationId/pricing/imports';

export const pricingImportHandlers = {
  ...defineHandler({
    path: `${base}/analyze`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => {
      await new Promise(resolve => setTimeout(resolve, 1_200));
      const document = await documentStorage.getItem(`${organizationId}:${body.documentId}`);
      return buildSampleProposal({ organizationId, fileName: document?.name ?? 'Escandallos.xlsx' });
    },
  }),
  ...defineHandler({
    path: `${base}/confirm`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => confirmImport({ organizationId, input: body as PricingImportInput }),
  }),
};
