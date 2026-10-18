export type ImportConceptKind = 'cost' | 'shipping' | 'commission';

export type ImportIssue = {
  code: 'cost_mismatch' | 'margin_mismatch' | 'negative_amount' | 'missing_cost_row' | 'missing_price_row';
  /** null when the issue is about the whole block */
  productKey: string | null;
  /** The figure of the file and the one computed from its lines */
  expectedMinor: number | null;
  actualMinor: number | null;
};

export type PricingImportProduct = {
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
  matchedProduct: { id: string; name: string } | null;
};

export type PricingImportBlock = {
  id: string;
  sheetName: string;
  title: string | null;
  headerRow: number;
  concepts: Array<{ row: number; name: string; kind: ImportConceptKind }>;
  products: PricingImportProduct[];
  issues: ImportIssue[];
  /** false: the lines do not add up to the total cost of the file */
  isBalanced: boolean;
};

export type PricingImportProposal = {
  fileName: string;
  detectedWith: 'ai' | 'rules';
  /** demo_sample: the demo answers with a sample sheet, whatever the file */
  warnings: Array<'ai_not_configured' | 'ai_failed' | 'rows_truncated' | 'demo_sample'>;
  blocks: PricingImportBlock[];
  shippingRates: Array<{ id: string; name: string; amountMinor: number }>;
  priceLists: Array<{ id: string; name: string; isDefault: boolean }>;
};

export type PricingImportInput = {
  priceList: { mode: 'new'; name: string } | { mode: 'existing'; priceListId: string } | null;
  products: Array<{
    productId: string | null;
    name: string;
    costLines: Array<{ conceptName: string; amountMinor: number }>;
    priceMinor: number | null;
    shipping: { name: string; amountMinor: number } | null;
  }>;
};

export type PricingImportResult = { priceListId: string | null; createdProductsCount: number; updatedProductsCount: number; createdShippingRatesCount: number };
