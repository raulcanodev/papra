import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(64);
const amountMinorSchema = z.number().int().min(0).max(1_000_000_000);

export const productCostsSchema = z.object({
  // Concepts are referenced by name: a new name creates the concept, so the breakdown is typed like a spreadsheet
  lines: z.array(z.object({
    conceptName: z.string().trim().min(1).max(100),
    amountMinor: amountMinorSchema,
  })).max(100),
});

export const shippingRateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  carrierContactId: idSchema.nullable().optional(),
  amountMinor: amountMinorSchema,
  notes: z.string().trim().max(1_000).nullable().optional(),
});

export const priceListSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1_000).nullable().optional(),
  discountRateBps: z.number().int().min(0).max(10_000).default(0),
  defaultShippingRateId: idSchema.nullable().optional(),
  isDefault: z.boolean().default(false),
});

export const priceListItemsSchema = z.object({
  items: z.array(z.object({
    productId: idSchema,
    priceMinor: amountMinorSchema,
    overridesShipping: z.boolean().default(false),
    shippingRateId: idSchema.nullable().optional(),
  })).max(5_000).refine(items => new Set(items.map(item => item.productId)).size === items.length, { message: 'A product can only appear once in a price list' }),
});

export const priceListContactsSchema = z.object({
  contactIds: z.array(idSchema).max(10_000),
});

export const contactPriceListSchema = z.object({
  priceListId: idSchema.nullable(),
});

export const duplicatePriceListSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
