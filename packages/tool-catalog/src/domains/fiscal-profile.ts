import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, pick, withoutUndefined } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { amountToMinor, percentToBps } from '../units';
import { amountSchema, optionalText, percentSchema, READ_ONLY_NOTE } from './schemas';

// Fields copied as they are between the stored profile and the update body
const PASSTHROUGH_KEYS = [
  'legalName',
  'taxId',
  'email',
  'addressLine1',
  'addressLine2',
  'postalCode',
  'city',
  'region',
  'country',
  'currency',
  'locale',
  'paymentTermsDays',
  'defaultNotes',
  'defaultTerms',
  'templateId',
  'defaultWithholdingRateBps',
  'legalForm',
  'vatRegime',
  'incomeTaxMethod',
  'lastCorporateTaxQuotaMinor',
  'accountantEmail',
] as const;

export const fiscalProfileTools = [
  defineOrganizationTool({
    name: 'get_fiscal_profile',
    title: 'Get fiscal profile',
    description: `Get the fiscal identity of the organization: legal name, NIF, address, legal form (autónomo or sociedad), VAT regime, income tax method, default IRPF withholding and accountant email. It decides which taxes apply, so read it before giving tax advice. profile is null when it was never filled. ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.INVOICES.READ,
    run: (_input, { api, organizationId }) => api.request('GET', organizationPath(organizationId, '/invoicing/profile')),
  }),
  defineOrganizationTool({
    name: 'update_fiscal_profile',
    title: 'Update fiscal profile',
    description: 'Change fiscal data of the organization. Only the fields you pass change. legalName is required the first time. Do not guess legal form, VAT regime or income tax method: ask the user.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.INVOICES.UPDATE,
    input: {
      legalName: z.string().trim().min(1).max(200).optional(),
      taxId: optionalText().describe('NIF / CIF'),
      email: z.string().trim().email().nullable().optional(),
      addressLine1: optionalText(),
      addressLine2: optionalText(),
      postalCode: optionalText(),
      city: optionalText(),
      region: optionalText(),
      country: optionalText(),
      paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
      defaultWithholdingPercent: percentSchema('Default IRPF withholding on issued invoices.').optional(),
      legalForm: z.enum(['self_employed', 'company']).nullable().optional().describe('self_employed = autónomo, company = sociedad (SL, SA...)'),
      vatRegime: z.enum(['general', 'equivalence_surcharge', 'exempt']).optional(),
      incomeTaxMethod: z.enum(['direct_simplified', 'direct_normal', 'modules']).optional().describe('Autónomos only: how the IRPF is computed'),
      lastCorporateTaxQuotaAmount: amountSchema('Quota of the last corporate tax return (modelo 200), for sociedades.').nullable().optional(),
      accountantEmail: z.string().trim().email().nullable().optional().describe('Where the quarterly accountant pack is sent'),
    },
    run: async ({ defaultWithholdingPercent, lastCorporateTaxQuotaAmount, ...changes }, { api, organizationId }) => {
      const path = organizationPath(organizationId, '/invoicing/profile');
      const { profile } = await api.request<{ profile: Record<string, unknown> | null }>('GET', path);

      return api.request('PUT', path, {
        ...(profile === null ? {} : pick(profile, PASSTHROUGH_KEYS)),
        ...withoutUndefined(changes),
        ...(defaultWithholdingPercent === undefined ? {} : { defaultWithholdingRateBps: percentToBps(defaultWithholdingPercent) }),
        ...(lastCorporateTaxQuotaAmount === undefined ? {} : { lastCorporateTaxQuotaMinor: lastCorporateTaxQuotaAmount === null ? null : amountToMinor(lastCorporateTaxQuotaAmount) }),
      });
    },
  }),
];
