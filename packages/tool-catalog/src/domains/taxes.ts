import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, withQuery } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { amountToMinor, percentToBps } from '../units';
import { amountSchema, percentSchema } from './schemas';

const EXPENSE_CATEGORIES = ['goods', 'supplies', 'rent', 'professional_services', 'software', 'marketing', 'travel', 'vehicle', 'insurance', 'bank_fees', 'taxes_and_fees', 'other'] as const;

export const taxTools = [
  defineOrganizationTool({
    name: 'get_quarterly_taxes',
    title: 'Get quarterly taxes estimate',
    description: 'Estimate the Spanish quarterly taxes of the organization from its issued and received invoices: IVA (modelo 303), IRPF instalment (130), withholdings (111, 115) or corporate tax instalment (202), with the filing deadline. It is an ESTIMATE to prepare the filing, not the filing. Optionally simulate a purchase to see how much it would lower the taxes. Amounts in the response are in minor units (cents).',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.TAXES.READ,
    input: {
      year: z.number().int().min(2000).max(2100),
      quarter: z.number().int().min(1).max(4),
      simulatePurchase: z.object({
        baseAmount: amountSchema('Purchase base WITHOUT VAT.'),
        taxRatePercent: percentSchema('VAT rate of the purchase.').default(21),
        deductiblePercent: percentSchema('Deductible share.').default(100),
        category: z.enum(EXPENSE_CATEGORIES).default('other'),
      }).optional().describe('A purchase the user is considering, to see its tax effect'),
    },
    run: ({ year, quarter, simulatePurchase }, { api, organizationId }) => api.request('GET', withQuery(organizationPath(organizationId, `/taxes/${year}/${quarter}`), {
      simulateBaseMinor: simulatePurchase === undefined ? undefined : amountToMinor(simulatePurchase.baseAmount),
      simulateTaxRateBps: simulatePurchase === undefined ? undefined : percentToBps(simulatePurchase.taxRatePercent),
      simulateDeductibleRateBps: simulatePurchase === undefined ? undefined : percentToBps(simulatePurchase.deductiblePercent),
      simulateCategory: simulatePurchase?.category,
    })),
  }),
];
