import type { ProductCatalogImportInput, ProductScanField, ProductScanProposal } from '../../product-scanner/product-scanner.types';
import { FetchError } from 'ofetch';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { customPropertyDefinitionStorage } from '../demo.storage';
import { findMany } from '../demo.storage.models';
import { getDemoContact, listDemoContactProducts, saveDemoProduct } from '../invoicing/demo-invoicing';
import { generatePropertyKey } from '../search/demo.search.services';

// The demo has no model to read the files: whatever is uploaded, it answers with this sample fabric catalog.
// The fields go through the same rule as the server, so a second scan fills the fields the first one created.
const SAMPLE_FIELDS = [
  { name: 'Color de tela', type: 'text', description: 'Color del tejido' },
  { name: 'Gramaje (g/m²)', type: 'number', description: 'Peso del tejido por metro cuadrado' },
  { name: 'Ignífugo', type: 'boolean', description: 'Tejido resistente al fuego' },
] as const;

const SAMPLE_PRODUCTS = [
  { name: 'Lona impermeable 600D', description: 'Ref. LN-600 · Poliéster con recubrimiento PVC', unit: 'm', unitPriceMinor: 1250, values: ['Azul marino', 600, true] },
  { name: 'Loneta de algodón', description: 'Ref. LA-280 · 100% algodón', unit: 'm', unitPriceMinor: 890, values: ['Crudo', 280, false] },
  { name: 'Tela acrílica para toldo', description: 'Ref. TA-300 · Acrílico tintado en masa', unit: 'm', unitPriceMinor: 1875, values: ['Rojo', 300, true] },
];

function fail(message: string, status: number): never {
  throw Object.assign(new FetchError(message), { status, data: { error: { message } } });
}

async function getProductDefinitions({ organizationId }: { organizationId: string }) {
  return findMany(customPropertyDefinitionStorage, definition => definition.organizationId === organizationId && definition.entityType === 'product');
}

async function getSupplierOrFail({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  const contact = await getDemoContact({ organizationId, contactId });

  if (!contact) {
    fail('Contact not found.', 404);
  }

  return contact;
}

export const productScannerHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/contacts/:contactId/product-catalog/scan',
    method: 'POST',
    handler: async ({ params: { organizationId, contactId } }): Promise<ProductScanProposal> => {
      await getSupplierOrFail({ organizationId, contactId });
      await new Promise(resolve => setTimeout(resolve, 1_200));

      const definitions = await getProductDefinitions({ organizationId });
      const existingProducts = await listDemoContactProducts({ organizationId, contactId });

      const fields: ProductScanField[] = SAMPLE_FIELDS.map((field) => {
        const key = generatePropertyKey({ name: field.name });
        const existing = definitions.find(definition => definition.key === key && definition.type === field.type);

        return existing
          ? { ref: existing.id, status: 'existing', name: existing.name, type: existing.type, description: existing.description ?? null, options: [] }
          : { ref: `new:${key}`, status: 'new', name: field.name, type: field.type, description: field.description, options: [] };
      });

      return {
        fields,
        products: SAMPLE_PRODUCTS.map(product => ({
          matchesProductId: existingProducts.find(existing => existing.name === product.name)?.id ?? null,
          name: product.name,
          description: product.description,
          unit: product.unit,
          unitPriceMinor: product.unitPriceMinor,
          currency: 'EUR',
          taxRateBps: 2100,
          values: Object.fromEntries(fields.map((field, index) => [field.ref, product.values[index]])),
        })),
        warnings: ['Demo: este es un catálogo de ejemplo. En tu cuenta, la IA lee el archivo que subas.'],
        unreadableFiles: [],
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/contacts/:contactId/product-catalog/import',
    method: 'POST',
    handler: async ({ params: { organizationId, contactId }, body }) => {
      await getSupplierOrFail({ organizationId, contactId });

      const input = body as ProductCatalogImportInput;
      const definitions = await getProductDefinitions({ organizationId });
      const definitionIdByRef = new Map<string, string>(definitions.map(definition => [definition.id, definition.id]));
      const now = new Date();
      let createdFieldsCount = 0;

      for (const field of input.newFields) {
        const key = generatePropertyKey({ name: field.name });
        const existing = field.existingPropertyDefinitionId ?? definitions.find(definition => definition.key === key)?.id;

        if (existing) {
          definitionIdByRef.set(field.ref, existing);
          continue;
        }

        const definition = { id: createId({ prefix: 'cpd' }), organizationId, name: field.name, key, description: field.description, type: field.type, entityType: 'product', displayOrder: definitions.length, options: [], createdAt: now, updatedAt: now };
        await customPropertyDefinitionStorage.setItem(definition.id, definition as any);
        definitions.push(definition as any);
        definitionIdByRef.set(field.ref, definition.id);
        createdFieldsCount += 1;
      }

      const existingProducts = await listDemoContactProducts({ organizationId, contactId });
      let createdCount = 0;
      let updatedCount = 0;

      for (const { matchesProductId, values, taxRateBps, ...fields } of input.products) {
        const existing = existingProducts.find(product => product.id === matchesProductId);
        const customProperties = Object.fromEntries(Object.entries(values).map(([ref, value]) => [definitionIdByRef.get(ref), value]).filter(([id]) => id !== undefined));

        await saveDemoProduct({
          product: existing
            ? { ...existing, ...fields, taxRateBps: taxRateBps ?? existing.taxRateBps, customProperties: { ...existing.customProperties, ...customProperties }, updatedAt: now.toISOString() }
            : { id: createId({ prefix: 'prd' }), organizationId, ...fields, taxRateBps: taxRateBps ?? 2100, contactId, icon: null, iconColor: null, imageDocumentId: null, customProperties, archivedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString() },
        });

        if (existing) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }
      }

      return { createdCount, updatedCount, createdFieldsCount };
    },
  }),
};
