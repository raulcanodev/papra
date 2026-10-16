import type { CatalogReading } from './product-scanner.models';
import type { CatalogReader } from './product-scanner.usecases';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { overrideConfig } from '../config/config.test-utils';
import { contactsTable } from '../contacts/contacts.table';
import { createCustomPropertiesRepository } from '../custom-properties/custom-properties.repository';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { importProductCatalog, scanProductCatalog } from './product-scanner.usecases';

const ORG_ID = 'org_111111111111111111111111';
const CONTACT_ID = 'ctc_111111111111111111111111';

function product(overrides: Partial<CatalogReading['products'][number]> = {}): CatalogReading['products'][number] {
  return {
    name: 'Lona 600',
    description: null,
    reference: null,
    unit: 'm',
    unitPrice: 12.5,
    currency: 'EUR',
    taxRatePercent: 21,
    newFieldValues: [],
    ...overrides,
  };
}

async function setup() {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    documents: [
      { id: 'doc_1', organizationId: ORG_ID, name: 'catalogo.txt', originalName: 'catalogo.txt', mimeType: 'text/plain', originalStorageKey: 'key1', originalSha256Hash: 'hash1', content: 'Lona 600 - color de tela: azul - 12,50 €/m' },
      { id: 'doc_2', organizationId: ORG_ID, name: 'catalogo-2.txt', originalName: 'catalogo-2.txt', mimeType: 'text/plain', originalStorageKey: 'key2', originalSha256Hash: 'hash2', content: 'Lona 900 - color de tela: rojo - 15 €/m' },
    ],
  });
  await db.insert(contactsTable).values({ id: CONTACT_ID, organizationId: ORG_ID, name: 'Tejidos Levante', isCustomer: false, isSupplier: true });

  const config = overrideConfig({ env: 'test' });
  const calls: Parameters<CatalogReader>[0][] = [];

  const scan = async ({ documentId, reading }: { documentId: string; reading: CatalogReading }) => scanProductCatalog({
    db,
    config,
    documentsStorageService: {} as never,
    organizationId: ORG_ID,
    contactId: CONTACT_ID,
    documentIds: [documentId],
    readCatalog: async (args) => {
      calls.push(args);
      return reading;
    },
  });

  const getProductDefinitions = async () => (await createCustomPropertiesRepository({ db }).getOrganizationPropertyDefinitions({ organizationId: ORG_ID, entityTypes: ['product'] })).propertyDefinitions;

  return { db, config, calls, scan, getProductDefinitions };
}

describe('product scanner usecases', () => {
  test('a characteristic with no field is proposed as a new field, and a later catalog fills the field created then instead of proposing it again', async () => {
    const { db, config, calls, scan, getProductDefinitions } = await setup();

    const first = await scan({
      documentId: 'doc_1',
      reading: {
        newFields: [{ name: 'Color de tela', type: 'text', description: 'Color del tejido' }],
        products: [product({ newFieldValues: [{ field: 'Color de tela', value: 'azul' }] })],
        warnings: [],
      },
    });

    expect(first.fields).to.eql([{ ref: 'new:colordetela', status: 'new', name: 'Color de tela', type: 'text', description: 'Color del tejido', options: [] }]);
    expect(first.products[0]).to.include({ name: 'Lona 600', unitPriceMinor: 1250, taxRateBps: 2100, matchesProductId: null });
    expect(first.products[0]!.values).to.eql({ 'new:colordetela': 'azul' });

    await importProductCatalog({ db, config, organizationId: ORG_ID, contactId: CONTACT_ID, input: { newFields: first.fields.filter(field => field.status === 'new').map(({ ref, name, type, description }) => ({ ref, name, type: type as 'text', description })), products: first.products } });

    const definitions = await getProductDefinitions();
    expect(definitions.map(definition => definition.name)).to.eql(['Color de tela']);

    // The second scan shows the model the field it already has, as a slot to fill, and the products of the supplier
    const second = await scan({
      documentId: 'doc_2',
      reading: {
        newFields: [],
        products: [product({ name: 'Lona 900', unitPrice: 15, existingFields: { f1: 'rojo' } })],
        warnings: [],
      },
    });

    expect(calls[1]!.system).to.include('f1: "Color de tela" (text)');
    expect(calls[1]!.system).to.include('Lona 600');
    expect(second.fields).to.eql([{ ref: definitions[0]!.id, status: 'existing', name: 'Color de tela', type: 'text', description: 'Color del tejido', options: [] }]);
    expect(second.products[0]!.values).to.eql({ [definitions[0]!.id]: 'rojo' });
  });

  test('a new field the model declares with the name of an existing field is the existing field, never a duplicate', async () => {
    const { db, config, scan, getProductDefinitions } = await setup();
    const { propertyDefinition } = await createCustomPropertiesRepository({ db }).createPropertyDefinition({ definition: { organizationId: ORG_ID, name: 'Color de tela', type: 'text', entityType: 'product' } });

    const proposal = await scan({
      documentId: 'doc_2',
      reading: {
        newFields: [{ name: 'Color de Tela', type: 'text', description: 'Color' }, { name: 'color de tela', type: 'text', description: 'Color' }],
        products: [product({ newFieldValues: [{ field: 'Color de Tela', value: 'rojo' }] })],
        warnings: [],
      },
    });

    expect(proposal.fields.map(field => ({ ref: field.ref, status: field.status }))).to.eql([{ ref: propertyDefinition.id, status: 'existing' }]);
    expect(proposal.products[0]!.values).to.eql({ [propertyDefinition.id]: 'rojo' });

    // Even an import asking to create it again reuses it
    await importProductCatalog({ db, config, organizationId: ORG_ID, contactId: CONTACT_ID, input: { newFields: [{ ref: 'new:colordetela', name: 'Color de tela', type: 'text' }], products: [{ ...proposal.products[0]!, values: { 'new:colordetela': 'verde' } }] } });

    expect((await getProductDefinitions()).map(definition => definition.id)).to.eql([propertyDefinition.id]);
  });

  test('a product of the catalog that the supplier already has is updated, and a new field can be stored in an existing field chosen by the user', async () => {
    const { db, config, getProductDefinitions } = await setup();
    const { propertyDefinition } = await createCustomPropertiesRepository({ db }).createPropertyDefinition({ definition: { organizationId: ORG_ID, name: 'Color', type: 'text', entityType: 'product' } });
    const { product: existing } = await createInvoicingRepository({ db }).createProduct({ organizationId: ORG_ID, product: { name: 'Lona 600', unit: 'm', unitPriceMinor: 1000, currency: 'EUR', taxRateBps: 1000, contactId: CONTACT_ID } });

    const result = await importProductCatalog({
      db,
      config,
      organizationId: ORG_ID,
      contactId: CONTACT_ID,
      input: {
        newFields: [{ ref: 'new:tono', name: 'Tono', type: 'text', existingPropertyDefinitionId: propertyDefinition.id }],
        products: [{ matchesProductId: existing.id, name: 'Lona 600', description: null, unit: 'm', unitPriceMinor: 1250, currency: 'EUR', taxRateBps: null, values: { 'new:tono': 'azul' } }],
      },
    });

    expect(result).to.eql({ createdCount: 0, updatedCount: 1, createdFieldsCount: 0 });

    const { products } = await createInvoicingRepository({ db }).listProducts({ organizationId: ORG_ID, contactId: CONTACT_ID });
    expect(products.map(({ id, unitPriceMinor, taxRateBps }) => ({ id, unitPriceMinor, taxRateBps }))).to.eql([{ id: existing.id, unitPriceMinor: 1250, taxRateBps: 1000 }]);
    expect((await getProductDefinitions()).map(definition => definition.name)).to.eql(['Color']);

    const { rows } = await createCustomPropertiesRepository({ db }).getEntityCustomPropertyValues({ organizationId: ORG_ID, entityTypes: ['product'], entityIds: [existing.id] });
    expect(rows.map(row => row.value.textValue)).to.eql(['azul']);
  });
});
