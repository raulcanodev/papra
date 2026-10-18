import { z } from 'zod';
import { entityCustomPropertiesInputSchema } from '../custom-properties/entity-custom-properties.usecases';
import { instalmentsInputSchema, paymentMethodSchema } from '../due-dates/due-dates.schemas';
import { entityAppearanceSchema } from '../shared/appearance/appearance.schemas';
import { INCOME_TAX_METHODS, LEGAL_FORMS, VAT_REGIMES } from '../taxes/taxes.constants';
import { INVOICE_STATUSES, INVOICE_TEMPLATE_IDS, VERIFACTU_MODES } from './invoicing.constants';

const optionalText = z.string().trim().max(500).optional().nullable();
const currencySchema = z.string().trim().length(3).transform(value => value.toUpperCase());
// Spanish IRPF withholding rates go from 1% (some activities) to 24% (non residents), 50% leaves room for any case
const withholdingRateBpsSchema = z.number().int().min(0).max(5_000);

export const fiscalProfileSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  taxId: optionalText,
  email: z.string().trim().email().optional().nullable(),
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  region: optionalText,
  country: optionalText,
  currency: currencySchema.default('EUR'),
  locale: z.string().trim().min(2).max(20).default('es-ES'),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  defaultNotes: z.string().trim().max(5_000).optional().nullable(),
  defaultTerms: z.string().trim().max(5_000).optional().nullable(),
  templateId: z.enum(INVOICE_TEMPLATE_IDS).default('minimal'),
  defaultWithholdingRateBps: withholdingRateBpsSchema.default(0),
  legalForm: z.enum(LEGAL_FORMS).optional().nullable(),
  vatRegime: z.enum(VAT_REGIMES).default('general'),
  incomeTaxMethod: z.enum(INCOME_TAX_METHODS).default('direct_simplified'),
  lastCorporateTaxQuotaMinor: z.number().int().min(0).max(100_000_000_000).optional().nullable(),
  accountantEmail: z.string().trim().email().optional().nullable(),
});

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1_000).optional().nullable(),
  unit: z.string().trim().min(1).max(40).default('unit'),
  unitPriceMinor: z.number().int().min(0).max(1_000_000_000),
  currency: currencySchema.default('EUR'),
  taxRateBps: z.number().int().min(0).max(10_000).default(2_100),
  /** The supplier or customer it belongs to, null for our own catalog */
  contactId: z.string().trim().min(1).max(64).nullable().optional(),
  /** The document holding its photo */
  imageDocumentId: z.string().trim().min(1).max(64).nullable().optional(),
}).merge(entityAppearanceSchema);

export const productListQuerySchema = z.object({
  contactId: z.string().trim().min(1).max(64).optional(),
});

// Request body: the product fields plus the values of the organization custom properties for products
export const productBodySchema = productSchema.extend({ customProperties: entityCustomPropertiesInputSchema.optional() });

export const taxRateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  rateBps: z.number().int().min(0).max(10_000),
  isDefault: z.boolean().default(false),
});

export const invoiceSeriesSchema = z.object({
  name: z.string().trim().min(1).max(100),
  prefix: z.string().trim().min(1).max(30),
  nextNumber: z.number().int().min(1).max(1_000_000_000),
  padding: z.number().int().min(1).max(12),
  isDefault: z.boolean().default(false),
});

export const invoiceBrandingSchema = z.object({
  accentColor: z.string().trim().regex(/^#[0-9a-f]{6}$/i),
  footerText: z.string().trim().max(500).optional().nullable(),
  paymentDetails: z.string().trim().max(2_000).optional().nullable(),
});

export const invoiceItemSchema = z.object({
  productId: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().min(1).max(500),
  quantityMillis: z.number().int().min(1).max(1_000_000_000),
  unitPriceMinor: z.number().int().min(0).max(1_000_000_000),
  taxRateBps: z.number().int().min(0).max(10_000).default(0),
  discountRateBps: z.number().int().min(0).max(10_000).default(0),
});

export const invoiceDraftSchema = z.object({
  customerId: z.string().trim().min(1),
  seriesId: z.string().trim().min(1).optional().nullable(),
  salesRepresentativeId: z.string().trim().min(1).optional().nullable(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: currencySchema.default('EUR'),
  notes: z.string().trim().max(5_000).optional().nullable(),
  terms: z.string().trim().max(5_000).optional().nullable(),
  templateId: z.enum(INVOICE_TEMPLATE_IDS).default('minimal'),
  withholdingRateBps: withholdingRateBpsSchema.default(0),
  items: z.array(invoiceItemSchema).min(1).max(200),
  paymentMethod: paymentMethodSchema.optional().nullable(),
  // Several due dates when collected in instalments; a single one on the due date when absent
  instalments: instalmentsInputSchema.optional(),
}).refine(value => value.dueDate >= value.issueDate, {
  message: 'Due date must not be before issue date',
  path: ['dueDate'],
});

export const invoiceListQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
});

export const verifactuConfigurationSchema = z.object({
  mode: z.enum(VERIFACTU_MODES),
  applicabilityReason: z.string().trim().max(1_000).optional().nullable(),
  legalName: z.string().trim().max(200).optional().nullable(),
  taxId: z.string().trim().max(20).optional().nullable(),
  certificateConfigured: z.boolean().default(false),
  aeatValidationPassed: z.boolean().default(false),
  responsibleDeclarationAccepted: z.boolean().default(false),
  transmissionsPaused: z.boolean().default(false),
  pauseReason: z.string().trim().max(1_000).optional().nullable(),
});

export const verifactuSystemStateSchema = z.object({
  dispatchPaused: z.boolean(),
  reason: z.string().trim().max(1_000).optional().nullable(),
});
