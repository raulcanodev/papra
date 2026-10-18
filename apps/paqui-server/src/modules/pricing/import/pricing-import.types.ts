/** What a figure row of a block is: a line of the cost (of making, shipping or selling the product) or a computed row */
export type ImportRowRole = 'cost_line' | 'shipping' | 'commission' | 'total_cost' | 'selling_price' | 'margin' | 'ignore';

/** Where a block is in its sheet: rows are 1 based like the spreadsheet, columns 0 based */
export type SheetBlockLayout = {
  title: string | null;
  headerRow: number;
  variantRow: number | null;
  labelColumn: number;
  productColumns: number[];
  rows: Array<{ row: number; role: ImportRowRole }>;
};

export type SheetLayout = { sheetName: string; blocks: SheetBlockLayout[] };

export type ImportConceptKind = 'cost' | 'shipping' | 'commission';

export type ImportIssue = {
  code: 'cost_mismatch' | 'margin_mismatch' | 'negative_amount' | 'missing_cost_row' | 'missing_price_row';
  /** null when the issue is about the whole block */
  productKey: string | null;
  /** The figure of the file and the one computed from its lines */
  expectedMinor: number | null;
  actualMinor: number | null;
};

export type ImportBlockProduct = {
  key: string;
  column: string;
  name: string;
  baseName: string;
  variant: string | null;
  /** One per concept of the block, in the same order */
  amounts: number[];
  linesTotalMinor: number;
  costMinor: number | null;
  priceMinor: number | null;
  marginMinor: number | null;
};

export type ImportBlock = {
  id: string;
  sheetName: string;
  title: string | null;
  headerRow: number;
  concepts: Array<{ row: number; name: string; kind: ImportConceptKind }>;
  products: ImportBlockProduct[];
  issues: ImportIssue[];
  isBalanced: boolean;
};

/** A product of the file with the catalog product of the same name, if any */
export type PricingImportProduct = ImportBlockProduct & { matchedProduct: { id: string; name: string } | null };

export type PricingImportProposal = {
  fileName: string;
  detectedWith: 'ai' | 'rules';
  warnings: Array<'ai_not_configured' | 'ai_failed' | 'rows_truncated'>;
  blocks: Array<Omit<ImportBlock, 'products'> & { products: PricingImportProduct[] }>;
  shippingRates: Array<{ id: string; name: string; amountMinor: number }>;
  priceLists: Array<{ id: string; name: string; isDefault: boolean }>;
};
