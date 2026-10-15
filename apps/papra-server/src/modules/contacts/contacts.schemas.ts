import { z } from 'zod';
import { entityCustomPropertiesInputSchema } from '../custom-properties/entity-custom-properties.usecases';
import { entityAppearanceSchema } from '../shared/appearance/appearance.schemas';
import { CONTACT_KINDS, CONTACT_ROLES } from './contacts.constants';

const optionalText = z.string().trim().max(500).optional().nullable();
const currencySchema = z.string().trim().length(3).transform(value => value.toUpperCase());

export const contactIdSchema = z.string().trim().min(1).max(64);

export const contactSchema = z.object({
  kind: z.enum(CONTACT_KINDS).default('company'),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().nullable(),
  phone: optionalText,
  taxId: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  region: optionalText,
  country: optionalText,
  currency: currencySchema.default('EUR'),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  notes: z.string().trim().max(5_000).optional().nullable(),
  isCustomer: z.boolean().default(false),
  isSupplier: z.boolean().default(false),
  isSalesRepresentative: z.boolean().default(false),
}).merge(entityAppearanceSchema);

// Request body: the contact fields plus the values of the custom properties of its roles
export const contactBodySchema = contactSchema.extend({
  customProperties: entityCustomPropertiesInputSchema.optional(),
});

export const contactListQuerySchema = z.object({
  role: z.enum(CONTACT_ROLES).optional(),
});
