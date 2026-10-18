import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

type PriceListItem = { productId: string; productName: string; priceMinor: number; productCostMinor: number; shippingMinor: number; marginMinor: number; netPriceMinor: number };
type PriceList = { id: string; name: string; isDefault: boolean; items: PriceListItem[]; contacts: Array<{ id: string; name: string }> };

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }, { id: OTHER_ORG_ID, name: 'Org 2' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID, organizationId = ORG_ID }: { path: string; method?: string; body?: unknown; userId?: string; organizationId?: string }) => app.request(
    `/api/organizations/${organizationId}${path}`,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  const json = async <T>(args: Parameters<typeof request>[0]) => (await request(args)).json() as Promise<T>;

  const createContact = async (contact: Record<string, unknown>) => (await json<{ contact: { id: string } }>({ path: '/contacts', method: 'POST', body: contact })).contact;
  const createProduct = async (product: Record<string, unknown>) => (await json<{ product: { id: string } }>({ path: '/invoicing/products', method: 'POST', body: product })).product;
  const createShippingRate = async (rate: Record<string, unknown>) => (await json<{ shippingRate: { id: string } }>({ path: '/pricing/shipping-rates', method: 'POST', body: rate })).shippingRate;
  const createPriceList = async (priceList: Record<string, unknown>) => (await json<{ priceList: { id: string } }>({ path: '/pricing/price-lists', method: 'POST', body: priceList })).priceList;
  const getPriceList = async (priceListId: string) => (await json<{ priceList: PriceList }>({ path: `/pricing/price-lists/${priceListId}` })).priceList;

  return { request, json, createContact, createProduct, createShippingRate, createPriceList, getPriceList };
}

describe('pricing e2e', () => {
  test('a product cost breakdown creates its concepts on the fly and is replaced as a whole', async () => {
    const { json, createProduct } = await setupApp();
    const product = await createProduct({ name: 'Chair', unitPriceMinor: 9_000 });

    await json({ path: `/pricing/products/${product.id}/costs`, method: 'PUT', body: { lines: [{ conceptName: 'Frame', amountMinor: 1_000 }, { conceptName: 'Fabric', amountMinor: 495 }] } });
    const saved = await json<{ lines: Array<{ conceptName: string; amountMinor: number }>; totalMinor: number }>({ path: `/pricing/products/${product.id}/costs`, method: 'PUT', body: { lines: [{ conceptName: 'fabric', amountMinor: 500 }, { conceptName: 'Box', amountMinor: 165 }] } });

    // "fabric" reuses the existing "Fabric" concept
    expect(saved.lines.map(({ conceptName, amountMinor }) => [conceptName, amountMinor])).to.eql([['Fabric', 500], ['Box', 165]]);
    expect(saved.totalMinor).to.eql(665);

    const { concepts } = await json<{ concepts: Array<{ name: string }> }>({ path: '/pricing/cost-concepts' });
    expect(concepts.map(({ name }) => name)).to.eql(['Box', 'Fabric', 'Frame']);

    const { costs } = await json<{ costs: Array<{ productId: string; totalMinor: number }> }>({ path: '/pricing/product-costs' });
    expect(costs).to.eql([{ productId: product.id, totalMinor: 665 }]);
  });

  test('a price list line margin subtracts the product cost and the shipping of the list, unless the line overrides it', async () => {
    const { json, createProduct, createShippingRate, createPriceList, getPriceList } = await setupApp();
    const chair = await createProduct({ name: 'Chair', unitPriceMinor: 9_000 });
    const stool = await createProduct({ name: 'Stool', unitPriceMinor: 12_000 });
    await json({ path: `/pricing/products/${chair.id}/costs`, method: 'PUT', body: { lines: [{ conceptName: 'Materials', amountMinor: 6_000 }] } });
    const small = await createShippingRate({ name: 'Small parcel', amountMinor: 330 });
    const large = await createShippingRate({ name: 'Large parcel', amountMinor: 800 });
    const priceList = await createPriceList({ name: 'Standard', defaultShippingRateId: small.id });

    await json({ path: `/pricing/price-lists/${priceList.id}/items`, method: 'PUT', body: { items: [
      { productId: chair.id, priceMinor: 9_180 },
      { productId: stool.id, priceMinor: 11_000, overridesShipping: true, shippingRateId: large.id },
    ] } });

    const { items } = await getPriceList(priceList.id);
    expect(items.map(({ productName, productCostMinor, shippingMinor, marginMinor }) => [productName, productCostMinor, shippingMinor, marginMinor])).to.eql([
      ['Chair', 6_000, 330, 2_850],
      ['Stool', 0, 800, 10_200],
    ]);
  });

  test('a price list serves several contacts, a contact has a single one, and the others get the default price list', async () => {
    const { json, createContact, createProduct, createPriceList, getPriceList } = await setupApp();
    const product = await createProduct({ name: 'Chair', unitPriceMinor: 9_000 });
    const [alpha, beta, gamma] = [await createContact({ name: 'Alpha', isCustomer: true }), await createContact({ name: 'Beta', isCustomer: true }), await createContact({ name: 'Gamma', isCustomer: true })];
    const standard = await createPriceList({ name: 'Standard', isDefault: true });
    const special = await createPriceList({ name: 'Special', discountRateBps: 1_000 });
    await json({ path: `/pricing/price-lists/${standard.id}/items`, method: 'PUT', body: { items: [{ productId: product.id, priceMinor: 9_180 }] } });
    await json({ path: `/pricing/price-lists/${special.id}/items`, method: 'PUT', body: { items: [{ productId: product.id, priceMinor: 8_500 }] } });

    await json({ path: `/pricing/price-lists/${special.id}/contacts`, method: 'PUT', body: { contactIds: [alpha.id, beta.id] } });
    // Moving Beta to the standard list takes it out of the special one
    await json({ path: `/pricing/contacts/${beta.id}/price-list`, method: 'PUT', body: { priceListId: standard.id } });

    expect((await getPriceList(special.id)).contacts.map(({ name }) => name)).to.eql(['Alpha']);

    const pricesOf = async (contactId: string) => json<{ priceList: { name: string; discountRateBps: number } | null; isAssigned: boolean; prices: Array<{ priceMinor: number }> }>({ path: `/pricing/contacts/${contactId}/prices` });
    expect(await pricesOf(alpha.id)).to.eql({ priceList: { id: special.id, name: 'Special', discountRateBps: 1_000 }, isAssigned: true, prices: [{ productId: product.id, priceMinor: 8_500 }] });
    expect(await pricesOf(gamma.id)).to.eql({ priceList: { id: standard.id, name: 'Standard', discountRateBps: 0 }, isAssigned: false, prices: [{ productId: product.id, priceMinor: 9_180 }] });
  });

  test('the export for a contact only has products and prices, never costs nor margins', async () => {
    const { request, json, createProduct, createPriceList } = await setupApp();
    const product = await createProduct({ name: 'Chair; oak', unitPriceMinor: 9_000 });
    await json({ path: `/pricing/products/${product.id}/costs`, method: 'PUT', body: { lines: [{ conceptName: 'Secret material', amountMinor: 6_655 }] } });
    const priceList = await createPriceList({ name: 'Standard', discountRateBps: 1_000 });
    await json({ path: `/pricing/price-lists/${priceList.id}/items`, method: 'PUT', body: { items: [{ productId: product.id, priceMinor: 9_180 }] } });

    const bytes = new Uint8Array(await (await request({ path: `/pricing/price-lists/${priceList.id}/export.csv` })).arrayBuffer());
    const csv = new TextDecoder().decode(bytes);

    // UTF-8 BOM first, so spreadsheets read the accents
    expect([...bytes.slice(0, 3)]).to.eql([0xEF, 0xBB, 0xBF]);
    expect(csv).to.eql('Producto;Descripción;Unidad;Precio (sin IVA);Descuento %;Precio neto (sin IVA);IVA %;Moneda\r\n"Chair; oak";;unit;91,80;10,00;82,62;21,00;EUR\r\n');
    expect(csv).not.to.include('66,55');
    expect(csv).not.to.include('Secret');
  });

  test('without a discount the export for a contact has no discount columns, and the public data has no internal figures', async () => {
    const { request, json, createProduct, createPriceList } = await setupApp();
    const product = await createProduct({ name: 'Chair', unitPriceMinor: 9_000 });
    await json({ path: `/pricing/products/${product.id}/costs`, method: 'PUT', body: { lines: [{ conceptName: 'Secret material', amountMinor: 6_655 }] } });
    const priceList = await createPriceList({ name: 'Standard' });
    await json({ path: `/pricing/price-lists/${priceList.id}/items`, method: 'PUT', body: { items: [{ productId: product.id, priceMinor: 9_180 }] } });

    const csv = new TextDecoder().decode(new Uint8Array(await (await request({ path: `/pricing/price-lists/${priceList.id}/export.csv` })).arrayBuffer()));
    expect(csv).to.eql('Producto;Descripción;Unidad;Precio (sin IVA);IVA %;Moneda\r\nChair;;unit;91,80;21,00;EUR\r\n');

    const { priceList: shared } = await json<{ priceList: Record<string, unknown> & { items: Array<Record<string, unknown>> } }>({ path: `/pricing/price-lists/${priceList.id}/public` });
    expect(Object.keys(shared).sort()).to.eql(['companyName', 'discountRateBps', 'items', 'name']);
    expect(Object.keys(shared.items[0]!).sort()).to.eql(['currency', 'description', 'name', 'netPriceMinor', 'priceMinor', 'taxRateBps', 'unit']);
  });

  test('a duplicated price list keeps the products and prices but neither the contacts nor the default flag', async () => {
    const { json, createContact, createProduct, createPriceList, getPriceList } = await setupApp();
    const product = await createProduct({ name: 'Chair', unitPriceMinor: 9_000 });
    const contact = await createContact({ name: 'Alpha', isCustomer: true });
    const source = await createPriceList({ name: 'Standard', isDefault: true });
    await json({ path: `/pricing/price-lists/${source.id}/items`, method: 'PUT', body: { items: [{ productId: product.id, priceMinor: 9_180 }] } });
    await json({ path: `/pricing/price-lists/${source.id}/contacts`, method: 'PUT', body: { contactIds: [contact.id] } });

    const { priceList: copy } = await json<{ priceList: { id: string } }>({ path: `/pricing/price-lists/${source.id}/duplicate`, method: 'POST', body: { name: 'Standard 2027' } });
    const duplicated = await getPriceList(copy.id);

    expect([duplicated.name, duplicated.isDefault, duplicated.contacts, duplicated.items.map(({ priceMinor }) => priceMinor)]).to.eql(['Standard 2027', false, [], [9_180]]);
  });

  test('every price of a price list is raised or cut by a percentage at once, and the history says who did it', async () => {
    const { json, request, createProduct, createPriceList } = await setupApp();
    const chair = await createProduct({ name: 'Chair', unitPriceMinor: 9_000 });
    const stool = await createProduct({ name: 'Stool', unitPriceMinor: 5_000 });
    const priceList = await createPriceList({ name: 'Standard' });
    await json({ path: `/pricing/price-lists/${priceList.id}/items`, method: 'PUT', body: { items: [{ productId: chair.id, priceMinor: 9_180 }, { productId: stool.id, priceMinor: 5_000 }] } });

    await json({ path: `/pricing/price-lists/${priceList.id}/adjust`, method: 'POST', body: { direction: 'increase', rateBps: 500 } });
    const { priceList: adjusted } = await json<{ priceList: PriceList & { adjustments: Array<{ rateBps: number; productCount: number }> } }>({ path: `/pricing/price-lists/${priceList.id}/adjust`, method: 'POST', body: { direction: 'decrease', rateBps: 1_000 } });

    // 91.80 + 5% = 96.39, - 10% = 86.75; 50.00 + 5% = 52.50, - 10% = 47.25
    expect(adjusted.items.map(({ priceMinor }) => priceMinor)).to.eql([8_675, 4_725]);
    expect(adjusted.adjustments.map(({ rateBps, productCount }) => [rateBps, productCount])).to.eql([[-1_000, 2], [500, 2]]);

    expect((await request({ path: `/pricing/price-lists/${priceList.id}/adjust`, method: 'POST', body: { direction: 'decrease', rateBps: 10_000 } })).status).to.eql(400);
  });

  test('price lists, products, shipping rates and contacts of another organization cannot be used', async () => {
    const { request, json, createProduct, createPriceList } = await setupApp();
    const product = await createProduct({ name: 'Chair', unitPriceMinor: 9_000 });
    const priceList = await createPriceList({ name: 'Standard' });
    const foreignProduct = (await json<{ product: { id: string } }>({ path: '/invoicing/products', method: 'POST', body: { name: 'Foreign', unitPriceMinor: 100 }, userId: OTHER_USER_ID, organizationId: OTHER_ORG_ID })).product;
    const foreignContact = (await json<{ contact: { id: string } }>({ path: '/contacts', method: 'POST', body: { name: 'Foreign', isCustomer: true }, userId: OTHER_USER_ID, organizationId: OTHER_ORG_ID })).contact;

    expect((await request({ path: `/pricing/price-lists/${priceList.id}`, userId: OTHER_USER_ID, organizationId: OTHER_ORG_ID })).status).to.eql(404);
    expect((await request({ path: `/pricing/price-lists/${priceList.id}/items`, method: 'PUT', body: { items: [{ productId: foreignProduct.id, priceMinor: 1 }] } })).status).to.eql(404);
    expect((await request({ path: `/pricing/price-lists/${priceList.id}/contacts`, method: 'PUT', body: { contactIds: [foreignContact.id] } })).status).to.eql(404);
    expect((await request({ path: `/pricing/products/${foreignProduct.id}/costs` })).status).to.eql(404);
    expect((await request({ path: `/pricing/price-lists/${priceList.id}/items`, method: 'PUT', body: { items: [{ productId: product.id, priceMinor: 1, overridesShipping: true, shippingRateId: 'shr_unknown' }] } })).status).to.eql(404);
  });
});
