import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(64);
const amountMinorSchema = z.number().int().min(0).max(1_000_000_000);

export const analyzePricingImportSchema = z.object({
  documentId: idSchema,
});

// What the model answers: where the blocks are and what each figure row is. It never copies figures, they are read from the cells.
export const aiSheetLayoutSchema = z.object({
  blocks: z.array(z.object({
    sheetName: z.string().describe('Name of the sheet the block is in'),
    title: z.string().nullable().describe('Name of the block when the sheet gives one (a family, a collection), else null'),
    headerRow: z.number().int().describe('Row number of the header naming the products'),
    variantRow: z.number().int().nullable().describe('Row number under the header naming a variant of each product (finish, size, material...), else null'),
    labelColumn: z.string().describe('Column letter holding the row labels (the concept names)'),
    productColumns: z.array(z.string()).describe('Column letters of the products of the block, one per product or variant'),
    rows: z.array(z.object({
      row: z.number().int(),
      role: z.enum(['cost_line', 'shipping', 'commission', 'total_cost', 'selling_price', 'margin', 'ignore']),
    })).describe('Every row of figures of the block with its role'),
  })),
});

export type AiSheetLayout = z.infer<typeof aiSheetLayoutSchema>;

export const confirmPricingImportSchema = z.object({
  // null: only the products and their cost breakdowns are saved
  priceList: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('new'), name: z.string().trim().min(1).max(200) }),
    z.object({ mode: z.literal('existing'), priceListId: idSchema }),
  ]).nullable(),
  products: z.array(z.object({
    // An existing product of the catalog, null to create it with this name
    productId: idSchema.nullable(),
    name: z.string().trim().min(1).max(200),
    costLines: z.array(z.object({ conceptName: z.string().trim().min(1).max(100), amountMinor: amountMinorSchema })).max(100),
    priceMinor: amountMinorSchema.nullable(),
    // The shipping of the product in the price list: a shipping rate of this amount is reused or created
    shipping: z.object({ name: z.string().trim().min(1).max(100), amountMinor: amountMinorSchema }).nullable(),
  })).min(1).max(2_000),
});

export type ConfirmPricingImportInput = z.infer<typeof confirmPricingImportSchema>;
