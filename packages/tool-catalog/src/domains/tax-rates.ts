import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, segment, withoutUndefined } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { bpsToPercent, percentToBps } from '../units';
import { idSchema, percentSchema, READ_ONLY_NOTE } from './schemas';

type StoredTaxRate = { id: string; name: string; rateBps: number; isDefault: boolean };

export const taxRateTools = [
  defineOrganizationTool({
    name: 'list_tax_rates',
    title: 'List tax rates',
    description: `List the VAT rates available when invoicing (e.g. IVA 21%, 10%, 4%, exempt). ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.PRODUCTS.READ,
    run: (_input, { api, organizationId }) => api.request('GET', organizationPath(organizationId, '/invoicing/tax-rates')),
  }),
  defineOrganizationTool({
    name: 'create_tax_rate',
    title: 'Create tax rate',
    description: 'Add a tax rate. Only one rate is the default; setting isDefault replaces the previous default.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.PRODUCTS.CREATE,
    input: {
      name: z.string().trim().min(1).max(100).describe('e.g. "IVA 21%"'),
      ratePercent: percentSchema('Rate in percent, e.g. 21'),
      isDefault: z.boolean().default(false),
    },
    run: ({ name, ratePercent, isDefault }, { api, organizationId }) => api.request(
      'POST',
      organizationPath(organizationId, '/invoicing/tax-rates'),
      { name, rateBps: percentToBps(ratePercent), isDefault },
    ),
  }),
  defineOrganizationTool({
    name: 'update_tax_rate',
    title: 'Update tax rate',
    description: 'Change the name, the rate or the default flag of a tax rate. Only the fields you pass change.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.PRODUCTS.UPDATE,
    input: {
      taxRateId: idSchema('Tax rate ID'),
      name: z.string().trim().min(1).max(100).optional(),
      ratePercent: percentSchema('Rate in percent').optional(),
      isDefault: z.boolean().optional(),
    },
    run: async ({ taxRateId, ...changes }, { api, organizationId }) => {
      const { taxRates } = await api.request<{ taxRates: StoredTaxRate[] }>('GET', organizationPath(organizationId, '/invoicing/tax-rates'));
      const current = taxRates.find(taxRate => taxRate.id === taxRateId);

      if (!current) {
        throw new Error(`Tax rate ${taxRateId} not found. Use list_tax_rates to get a valid ID.`);
      }

      const merged = { name: current.name, ratePercent: bpsToPercent(current.rateBps), isDefault: current.isDefault, ...withoutUndefined(changes) };

      return api.request('PUT', organizationPath(organizationId, `/invoicing/tax-rates/${segment(taxRateId)}`), {
        name: merged.name,
        rateBps: percentToBps(merged.ratePercent),
        isDefault: merged.isDefault,
      });
    },
  }),
  defineOrganizationTool({
    name: 'delete_tax_rate',
    title: 'Delete tax rate',
    description: 'Archive a tax rate so it is no longer offered. Existing invoices are not affected.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.PRODUCTS.DELETE,
    input: { taxRateId: idSchema('Tax rate ID') },
    run: ({ taxRateId }, { api, organizationId }) => api.request('DELETE', organizationPath(organizationId, `/invoicing/tax-rates/${segment(taxRateId)}`)),
  }),
];
