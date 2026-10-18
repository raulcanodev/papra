export type CostConcept = { id: string; name: string };

export type ProductCostLine = { conceptName: string; amountMinor: number };

export type ProductCosts = { lines: Array<ProductCostLine & { conceptId: string }>; totalMinor: number };

export type ShippingRate = {
  id: string;
  name: string;
  carrierContactId: string | null;
  carrierName: string | null;
  amountMinor: number;
  notes: string | null;
};

export type ShippingRateInput = Pick<ShippingRate, 'name' | 'carrierContactId' | 'amountMinor' | 'notes'>;

export type PriceListSummary = {
  id: string;
  name: string;
  description: string | null;
  discountRateBps: number;
  defaultShippingRateId: string | null;
  isDefault: boolean;
  itemCount: number;
  contactCount: number;
  updatedAt: string;
};

export type PriceListInput = Pick<PriceListSummary, 'name' | 'description' | 'discountRateBps' | 'defaultShippingRateId' | 'isDefault'>;

/** A line of a price list with the internal figures (cost, shipping, margin): never shown to a contact */
export type PriceListItem = {
  productId: string;
  productName: string;
  productUnit: string;
  productBasePriceMinor: number;
  isProductArchived: boolean;
  priceMinor: number;
  overridesShipping: boolean;
  shippingRateId: string | null;
  appliedShippingRateId: string | null;
  productCostMinor: number;
  shippingMinor: number;
  netPriceMinor: number;
  costMinor: number;
  marginMinor: number;
  marginRateBps: number | null;
};

export type PriceListItemInput = Pick<PriceListItem, 'productId' | 'priceMinor' | 'overridesShipping' | 'shippingRateId'>;

export type PriceList = Omit<PriceListSummary, 'itemCount' | 'contactCount'> & {
  items: PriceListItem[];
  contacts: Array<{ id: string; name: string; isCustomer: boolean; isSupplier: boolean }>;
  /** Raises (positive rate) and cuts (negative) of all the prices, newest first */
  adjustments: Array<{ id: string; createdAt: string; rateBps: number; productCount: number; userName: string | null }>;
};

export type ContactPrices = {
  priceList: { id: string; name: string; discountRateBps: number } | null;
  /** false: the default price list applies because the contact has none */
  isAssigned: boolean;
  prices: Array<{ productId: string; priceMinor: number }>;
};
