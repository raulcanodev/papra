import type { PricingImportProposal } from '../pricing-import.types';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../../app/database/database.test-utils';
import { createServer } from '../../../app/server';
import { createTestServerDependencies } from '../../../app/server.test-utils';
import { overrideConfig } from '../../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../../organizations/organizations.constants';
import { buildXlsxFixture } from '../pricing-import.fixtures';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

type Proposal = PricingImportProposal;
type PriceList = { id: string; name: string; isDefault: boolean; items: Array<{ productName: string; priceMinor: number; productCostMinor: number; shippingMinor: number; marginMinor: number; overridesShipping: boolean }> };

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }, { id: OTHER_ORG_ID, name: 'Org 2' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  // No model configured: the layout rules read the file, the same way the model answer is read
  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test', documentsStorage: { driver: 'in-memory' } }) }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID, organizationId = ORG_ID }: { path: string; method?: string; body?: unknown; userId?: string; organizationId?: string }) => app.request(
    `/api/organizations/${organizationId}${path}`,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );
  const json = async <T>(args: Parameters<typeof request>[0]) => (await request(args)).json() as Promise<T>;

  const upload = async ({ file }: { file: File }) => {
    const formData = new FormData();
    formData.append('file', file);
    const body = new Response(formData);
    const response = await app.request(`/api/organizations/${ORG_ID}/ai/attachments`, { method: 'POST', headers: Object.fromEntries(body.headers.entries()), body: await body.arrayBuffer() }, { loggedInUserId: USER_ID });
    return (await response.json() as { document: { id: string } }).document;
  };

  const uploadFixture = async () => upload({ file: new File([new Uint8Array(await buildXlsxFixture())], 'Escandallos 2026.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
  const analyze = async (documentId: string) => json<Proposal>({ path: '/pricing/imports/analyze', method: 'POST', body: { documentId } });

  // What the preview sends with its defaults: cost lines in the breakdown, shipping rows as shipping, sales commissions left out
  const buildConfirmation = ({ proposal, priceList }: { proposal: Proposal; priceList: unknown }) => ({
    priceList,
    products: proposal.blocks.flatMap(block => block.products.map(product => ({
      productId: product.matchedProduct?.id ?? null,
      name: product.name,
      costLines: block.concepts.flatMap((concept, index) => (concept.kind === 'cost' ? [{ conceptName: concept.name, amountMinor: product.amounts[index]! }] : [])),
      priceMinor: product.priceMinor,
      shipping: block.concepts.some(concept => concept.kind === 'shipping')
        ? { name: 'Porte', amountMinor: block.concepts.reduce((total, concept, index) => total + (concept.kind === 'shipping' ? product.amounts[index]! : 0), 0) }
        : null,
    }))),
  });

  return { db, request, json, upload, uploadFixture, analyze, buildConfirmation };
}

describe('pricing import e2e', () => {
  test('a spreadsheet with two blocks is read into products, breakdowns and selling prices, and the block that does not add up is flagged', async () => {
    const { uploadFixture, analyze, json } = await setupApp();
    const luna = (await json<{ product: { id: string } }>({ path: '/invoicing/products', method: 'POST', body: { name: 'LUNA', unitPriceMinor: 25_000 } })).product;

    const proposal = await analyze((await uploadFixture()).id);

    expect([proposal.fileName, proposal.detectedWith, proposal.warnings]).to.eql(['Escandallos 2026.xlsx', 'rules', ['ai_not_configured']]);
    expect(proposal.blocks.map(({ id, title, headerRow, isBalanced }) => ({ id, title, headerRow, isBalanced }))).to.eql([
      { id: 'b1', title: 'Tarifa 2026', headerRow: 3, isBalanced: true },
      { id: 'b2', title: null, headerRow: 15, isBalanced: false },
    ]);

    const [first, second] = proposal.blocks;
    expect(first!.concepts.map(({ name, kind }) => `${name}:${kind}`)).to.eql(['Carcasa:cost', 'Tela:cost', 'Embalaje:cost', 'Porte:shipping', 'Representante:commission']);
    expect(first!.products.map(({ name, priceMinor, costMinor, matchedProduct }) => ({ name, priceMinor, costMinor, matchedProductId: matchedProduct?.id ?? null }))).to.eql([
      { name: 'Owen (Pata madera)', priceMinor: 32_000, costMinor: 21_650, matchedProductId: null },
      { name: 'Owen (Pata metal)', priceMinor: 32_500, costMinor: 21_750, matchedProductId: null },
      { name: 'Luna', priceMinor: 26_000, costMinor: 17_400, matchedProductId: luna.id },
    ]);
    expect(second!.issues).to.eql([{ code: 'cost_mismatch', productKey: 'b2-B', expectedMinor: 11_000, actualMinor: 10_500 }]);
  });

  test('confirming creates the products and their cost breakdowns, turns shipping rows into shipping rates and fills a new price list', async () => {
    const { uploadFixture, analyze, json, buildConfirmation } = await setupApp();
    const proposal = await analyze((await uploadFixture()).id);

    const result = await json<{ priceListId: string; createdProductsCount: number; updatedProductsCount: number; createdShippingRatesCount: number }>({
      path: '/pricing/imports/confirm',
      method: 'POST',
      body: buildConfirmation({ proposal, priceList: { mode: 'new', name: 'Tarifa 2026' } }),
    });

    // Porte 25 € (both Owen), 20 € (Luna) and 15 € (Nora and Duna)
    expect([result.createdProductsCount, result.updatedProductsCount, result.createdShippingRatesCount]).to.eql([5, 0, 3]);

    const { priceList } = await json<{ priceList: PriceList }>({ path: `/pricing/price-lists/${result.priceListId}` });
    expect([priceList.name, priceList.isDefault]).to.eql(['Tarifa 2026', true]);
    // The margin of the app leaves out the sales agent, kept for review instead of counted as making the product
    expect(priceList.items.map(({ productName, priceMinor, productCostMinor, shippingMinor, marginMinor }) => [productName, priceMinor, productCostMinor, shippingMinor, marginMinor])).to.eql([
      ['Owen (Pata madera)', 32_000, 17_350, 2_500, 12_150],
      ['Owen (Pata metal)', 32_500, 17_350, 2_500, 12_650],
      ['Luna', 26_000, 13_900, 2_000, 10_100],
      ['Nora', 18_000, 9_000, 1_500, 7_500],
      ['Duna', 19_900, 10_500, 1_500, 7_900],
    ]);

    const { shippingRates } = await json<{ shippingRates: Array<{ name: string; amountMinor: number }> }>({ path: '/pricing/shipping-rates' });
    expect(shippingRates.map(({ name, amountMinor }) => [name, amountMinor]).toSorted(([, a], [, b]) => Number(a) - Number(b))).to.eql([['Porte', 1_500], ['Porte', 2_000], ['Porte', 2_500]]);

    const { concepts } = await json<{ concepts: Array<{ name: string }> }>({ path: '/pricing/cost-concepts' });
    expect(concepts.map(({ name }) => name)).to.eql(['Carcasa', 'Cojines', 'Embalaje', 'Estructura', 'Tela']);
  });

  test('importing again into an existing price list matches the products created the first time, reuses the shipping rates and keeps the other products of the list', async () => {
    const { uploadFixture, analyze, json, buildConfirmation } = await setupApp();
    const other = (await json<{ product: { id: string } }>({ path: '/invoicing/products', method: 'POST', body: { name: 'Mesa', unitPriceMinor: 50_000 } })).product;
    const { priceList: existing } = await json<{ priceList: { id: string } }>({ path: '/pricing/price-lists', method: 'POST', body: { name: 'Distribuidores', discountRateBps: 1_000 } });
    await json({ path: `/pricing/price-lists/${existing.id}/items`, method: 'PUT', body: { items: [{ productId: other.id, priceMinor: 45_000 }] } });

    const documentId = (await uploadFixture()).id;
    await json({ path: '/pricing/imports/confirm', method: 'POST', body: buildConfirmation({ proposal: await analyze(documentId), priceList: null }) });

    const again = await analyze(documentId);
    expect(again.blocks.flatMap(block => block.products).every(product => product.matchedProduct !== null)).to.eql(true);

    const result = await json<{ priceListId: string; createdProductsCount: number; updatedProductsCount: number; createdShippingRatesCount: number }>({ path: '/pricing/imports/confirm', method: 'POST', body: buildConfirmation({ proposal: again, priceList: { mode: 'existing', priceListId: existing.id } }) });
    expect([result.priceListId, result.createdProductsCount, result.updatedProductsCount, result.createdShippingRatesCount]).to.eql([existing.id, 0, 5, 3]);

    const { priceList } = await json<{ priceList: PriceList }>({ path: `/pricing/price-lists/${existing.id}` });
    expect(priceList.items.map(({ productName }) => productName)).to.eql(['Mesa', 'Owen (Pata madera)', 'Owen (Pata metal)', 'Luna', 'Nora', 'Duna']);
    expect((await json<{ products: unknown[] }>({ path: '/invoicing/products' })).products).to.have.length(6);
  });

  test('a file that is not a spreadsheet, or a document of another organization, cannot be imported', async () => {
    const { upload, uploadFixture, request } = await setupApp();
    const text = await upload({ file: new File(['hola'], 'notas.txt', { type: 'text/plain' }) });
    const fixture = await uploadFixture();

    const unreadable = await request({ path: '/pricing/imports/analyze', method: 'POST', body: { documentId: text.id } });
    expect(unreadable.status).to.eql(422);
    expect(await unreadable.json()).to.deep.include({ error: { code: 'pricing.import_unreadable', message: 'The file is not a readable spreadsheet (.xlsx or .csv)' } });

    expect((await request({ path: '/pricing/imports/analyze', method: 'POST', body: { documentId: fixture.id }, userId: OTHER_USER_ID, organizationId: OTHER_ORG_ID })).status).to.eql(404);
    expect((await request({ path: '/pricing/imports/analyze', method: 'POST', body: { documentId: fixture.id }, userId: OTHER_USER_ID })).status).to.eql(403);
  });

  test('nothing is saved when part of the confirmation fails', async () => {
    const { request, json } = await setupApp();
    const response = await request({
      path: '/pricing/imports/confirm',
      method: 'POST',
      body: { priceList: { mode: 'existing', priceListId: 'prl_unknown' }, products: [{ productId: null, name: 'Owen', costLines: [{ conceptName: 'Tela', amountMinor: 100 }], priceMinor: 1_000, shipping: null }] },
    });

    expect(response.status).to.eql(404);
    expect((await json<{ products: unknown[] }>({ path: '/invoicing/products' })).products).to.eql([]);
  });
});
