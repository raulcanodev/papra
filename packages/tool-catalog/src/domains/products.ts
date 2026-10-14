import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, segment, withoutUndefined } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { amountToMinor, bpsToPercent, minorToAmount, percentToBps } from '../units';
import { amountSchema, currencySchema, idSchema, optionalText, percentSchema, READ_ONLY_NOTE } from './schemas';

const productFields = {
  name: z.string().trim().min(1).max(200),
  description: optionalText(1_000),
  unit: z.string().trim().min(1).max(40).describe('Unit of sale: unit, hour, day, month, kg...'),
  unitPrice: amountSchema('Unit price WITHOUT tax.'),
  currency: currencySchema,
  taxRatePercent: percentSchema('VAT rate in percent: 21 general, 10 reduced, 4 super reduced, 0 exempt.'),
};

type StoredProduct = { id: string; name: string; description: string | null; unit: string; unitPriceMinor: number; currency: string; taxRateBps: number };

// Stored products use minor units and basis points, the tools use human units
function toProductBody(product: { name: string; description?: string | null; unit: string; unitPrice: number; currency: string; taxRatePercent: number }) {
  return {
    name: product.name,
    description: product.description,
    unit: product.unit,
    unitPriceMinor: amountToMinor(product.unitPrice),
    currency: product.currency,
    taxRateBps: percentToBps(product.taxRatePercent),
  };
}

function toProductFields(product: StoredProduct) {
  return {
    name: product.name,
    description: product.description,
    unit: product.unit,
    unitPrice: minorToAmount(product.unitPriceMinor),
    currency: product.currency,
    taxRatePercent: bpsToPercent(product.taxRateBps),
  };
}

export const productTools = [
  defineOrganizationTool({
    name: 'list_products',
    title: 'List products',
    description: `List the catalog of products and services that can be put on an invoice. ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.PRODUCTS.READ,
    run: (_input, { api, organizationId }) => api.request('GET', organizationPath(organizationId, '/invoicing/products')),
  }),
  defineOrganizationTool({
    name: 'create_product',
    title: 'Create product',
    description: 'Add a product or service to the catalog. List the products first to avoid duplicates.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.PRODUCTS.CREATE,
    input: {
      ...productFields,
      unit: productFields.unit.default('unit'),
      currency: productFields.currency.default('EUR'),
      taxRatePercent: productFields.taxRatePercent.default(21),
    },
    run: (product, { api, organizationId }) => api.request('POST', organizationPath(organizationId, '/invoicing/products'), toProductBody(product)),
  }),
  defineOrganizationTool({
    name: 'update_product',
    title: 'Update product',
    description: 'Change some fields of a product. Only the fields you pass change. Invoices already issued are not affected.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.PRODUCTS.UPDATE,
    input: {
      productId: idSchema('Product ID'),
      name: productFields.name.optional(),
      description: productFields.description,
      unit: productFields.unit.optional(),
      unitPrice: productFields.unitPrice.optional(),
      currency: productFields.currency.optional(),
      taxRatePercent: productFields.taxRatePercent.optional(),
    },
    run: async ({ productId, ...changes }, { api, organizationId }) => {
      const { products } = await api.request<{ products: StoredProduct[] }>('GET', organizationPath(organizationId, '/invoicing/products'));
      const current = products.find(product => product.id === productId);

      if (!current) {
        throw new Error(`Product ${productId} not found. Use list_products to get a valid ID.`);
      }

      return api.request(
        'PUT',
        organizationPath(organizationId, `/invoicing/products/${segment(productId)}`),
        toProductBody({ ...toProductFields(current), ...withoutUndefined(changes) }),
      );
    },
  }),
  defineOrganizationTool({
    name: 'delete_product',
    title: 'Delete product',
    description: 'Archive a product: it leaves the catalog, existing invoices keep their lines.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.PRODUCTS.DELETE,
    input: { productId: idSchema('Product ID') },
    run: ({ productId }, { api, organizationId }) => api.request('DELETE', organizationPath(organizationId, `/invoicing/products/${segment(productId)}`)),
  }),
];
