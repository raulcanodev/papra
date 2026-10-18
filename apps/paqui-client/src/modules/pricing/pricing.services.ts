import type { ContactPrices, CostConcept, PriceList, PriceListInput, PriceListItemInput, PriceListSummary, ProductCostLine, ProductCosts, ShippingRate, ShippingRateInput } from './pricing.types';
import { apiClient } from '../shared/http/api-client';

const basePath = (organizationId: string) => `/api/organizations/${organizationId}/pricing`;

// Everything pricing related lives under this key: saving a breakdown or a price list refreshes every view of it
export function getPricingQueryKey({ organizationId }: { organizationId: string }) {
  return ['pricing', organizationId];
}

export async function fetchCostConcepts({ organizationId }: { organizationId: string }) {
  return apiClient<{ concepts: CostConcept[] }>({ path: `${basePath(organizationId)}/cost-concepts`, method: 'GET' });
}

export async function fetchProductCostTotals({ organizationId }: { organizationId: string }) {
  return apiClient<{ costs: Array<{ productId: string; totalMinor: number }> }>({ path: `${basePath(organizationId)}/product-costs`, method: 'GET' });
}

export async function fetchProductCosts({ organizationId, productId }: { organizationId: string; productId: string }) {
  return apiClient<ProductCosts>({ path: `${basePath(organizationId)}/products/${productId}/costs`, method: 'GET' });
}

export async function saveProductCosts({ organizationId, productId, lines }: { organizationId: string; productId: string; lines: ProductCostLine[] }) {
  return apiClient<ProductCosts>({ path: `${basePath(organizationId)}/products/${productId}/costs`, method: 'PUT', body: { lines } });
}

export async function fetchShippingRates({ organizationId }: { organizationId: string }) {
  return apiClient<{ shippingRates: ShippingRate[] }>({ path: `${basePath(organizationId)}/shipping-rates`, method: 'GET' });
}

export async function createShippingRate({ organizationId, shippingRate }: { organizationId: string; shippingRate: ShippingRateInput }) {
  return apiClient<{ shippingRate: ShippingRate }>({ path: `${basePath(organizationId)}/shipping-rates`, method: 'POST', body: shippingRate });
}

export async function updateShippingRate({ organizationId, shippingRateId, shippingRate }: { organizationId: string; shippingRateId: string; shippingRate: ShippingRateInput }) {
  return apiClient<{ shippingRate: ShippingRate }>({ path: `${basePath(organizationId)}/shipping-rates/${shippingRateId}`, method: 'PUT', body: shippingRate });
}

export async function deleteShippingRate({ organizationId, shippingRateId }: { organizationId: string; shippingRateId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/shipping-rates/${shippingRateId}`, method: 'DELETE' });
}

export async function fetchPriceLists({ organizationId }: { organizationId: string }) {
  return apiClient<{ priceLists: PriceListSummary[] }>({ path: `${basePath(organizationId)}/price-lists`, method: 'GET' });
}

export async function fetchPriceList({ organizationId, priceListId }: { organizationId: string; priceListId: string }) {
  return apiClient<{ priceList: PriceList }>({ path: `${basePath(organizationId)}/price-lists/${priceListId}`, method: 'GET' });
}

export async function createPriceList({ organizationId, priceList }: { organizationId: string; priceList: PriceListInput }) {
  return apiClient<{ priceList: PriceListSummary }>({ path: `${basePath(organizationId)}/price-lists`, method: 'POST', body: priceList });
}

export async function updatePriceList({ organizationId, priceListId, priceList }: { organizationId: string; priceListId: string; priceList: PriceListInput }) {
  return apiClient<{ priceList: PriceListSummary }>({ path: `${basePath(organizationId)}/price-lists/${priceListId}`, method: 'PUT', body: priceList });
}

export async function deletePriceList({ organizationId, priceListId }: { organizationId: string; priceListId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/price-lists/${priceListId}`, method: 'DELETE' });
}

export async function duplicatePriceList({ organizationId, priceListId, name }: { organizationId: string; priceListId: string; name: string }) {
  return apiClient<{ priceList: PriceListSummary }>({ path: `${basePath(organizationId)}/price-lists/${priceListId}/duplicate`, method: 'POST', body: { name } });
}

export async function savePriceListItems({ organizationId, priceListId, items }: { organizationId: string; priceListId: string; items: PriceListItemInput[] }) {
  return apiClient<{ priceList: PriceList }>({ path: `${basePath(organizationId)}/price-lists/${priceListId}/items`, method: 'PUT', body: { items } });
}

export async function savePriceListContacts({ organizationId, priceListId, contactIds }: { organizationId: string; priceListId: string; contactIds: string[] }) {
  return apiClient<{ priceList: PriceList }>({ path: `${basePath(organizationId)}/price-lists/${priceListId}/contacts`, method: 'PUT', body: { contactIds } });
}

export async function fetchContactPrices({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  return apiClient<ContactPrices>({ path: `${basePath(organizationId)}/contacts/${contactId}/prices`, method: 'GET' });
}

export async function setContactPriceList({ organizationId, contactId, priceListId }: { organizationId: string; contactId: string; priceListId: string | null }) {
  return apiClient<ContactPrices>({ path: `${basePath(organizationId)}/contacts/${contactId}/price-list`, method: 'PUT', body: { priceListId } });
}

/** Downloads what can be sent to a contact: products and prices, never costs nor margins */
export async function downloadPriceListCsv({ organizationId, priceListId, name, lang }: { organizationId: string; priceListId: string; name: string; lang: 'es' | 'en' }) {
  const blob = await apiClient<Blob, 'blob'>({ path: `${basePath(organizationId)}/price-lists/${priceListId}/export.csv`, method: 'GET', query: { lang }, responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.replace(/[^\w.-]+/g, '-')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
