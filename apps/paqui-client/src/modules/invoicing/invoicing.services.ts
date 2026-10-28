/* eslint-disable style/max-statements-per-line */
import type { EntityCustomPropertiesInput } from '../custom-properties/custom-properties.types';
import type { AsDto } from '../shared/http/http-client.types';
import type { FiscalProfile, FiscalProfileInput, Invoice, InvoiceBranding, InvoiceBrandingInput, InvoiceDraftInput, InvoiceSeries, InvoiceSeriesInput, InvoicingProduct, InvoicingTaxRate, ProductInput, TaxRateInput, VerifactuConfiguration, VerifactuRecord } from './invoicing.types';
import { buildTimeConfig } from '../config/config';
import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

const basePath = (organizationId: string) => `/api/organizations/${organizationId}/invoicing`;

export async function fetchFiscalProfile({ organizationId }: { organizationId: string }) {
  const { profile } = await apiClient<{ profile: AsDto<FiscalProfile> | null }>({ path: `${basePath(organizationId)}/profile`, method: 'GET' });
  return { profile: profile ? coerceDates(profile) : null };
}

export async function saveFiscalProfile({ organizationId, profile }: { organizationId: string; profile: FiscalProfileInput }) {
  const result = await apiClient<{ profile: AsDto<FiscalProfile> }>({ path: `${basePath(organizationId)}/profile`, method: 'PUT', body: profile });
  return { profile: coerceDates(result.profile) };
}

export async function fetchVerifactuConfiguration({ organizationId }: { organizationId: string }) {
  const { configuration } = await apiClient<{ configuration: AsDto<VerifactuConfiguration> | null }>({ path: `${basePath(organizationId)}/verifactu/configuration`, method: 'GET' });
  return { configuration: configuration ? coerceDates(configuration) as VerifactuConfiguration : null };
}

export async function fetchVerifactuRecords({ organizationId }: { organizationId: string }) {
  const { records } = await apiClient<{ records: AsDto<VerifactuRecord>[] }>({ path: `${basePath(organizationId)}/verifactu/records`, method: 'GET' });
  return { records: records.map(record => ({ ...record, generatedAt: new Date(record.generatedAt), createdAt: new Date(record.createdAt), acceptedAt: record.acceptedAt ? new Date(record.acceptedAt) : null })) };
}

type WithCustomProperties<T> = T & { customProperties?: EntityCustomPropertiesInput };

/** Our own catalog and the products of every contact, or only the products of one contact */
export async function fetchProducts({ organizationId, contactId }: { organizationId: string; contactId?: string }) {
  const { products } = await apiClient<{ products: AsDto<InvoicingProduct>[] }>({ path: `${basePath(organizationId)}/products`, method: 'GET', query: { contactId } }); return { products: products.map(product => coerceDates(product) as InvoicingProduct) };
}
export async function deleteProduct({ organizationId, productId }: { organizationId: string; productId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/products/${productId}`, method: 'DELETE' });
}
export async function createProduct({ organizationId, product }: { organizationId: string; product: WithCustomProperties<ProductInput> }) {
  const result = await apiClient<{ product: AsDto<InvoicingProduct> }>({ path: `${basePath(organizationId)}/products`, method: 'POST', body: product });
  return { product: coerceDates(result.product) as InvoicingProduct };
}
export async function updateProduct({ organizationId, productId, product }: { organizationId: string; productId: string; product: WithCustomProperties<ProductInput> }) {
  const result = await apiClient<{ product: AsDto<InvoicingProduct> }>({ path: `${basePath(organizationId)}/products/${productId}`, method: 'PUT', body: product });
  return { product: coerceDates(result.product) as InvoicingProduct };
}

export async function fetchTaxRates({ organizationId }: { organizationId: string }) {
  const { taxRates } = await apiClient<{ taxRates: AsDto<InvoicingTaxRate>[] }>({ path: `${basePath(organizationId)}/tax-rates`, method: 'GET' }); return { taxRates: taxRates.map(taxRate => coerceDates(taxRate) as InvoicingTaxRate) };
}
export async function createTaxRate({ organizationId, taxRate }: { organizationId: string; taxRate: TaxRateInput }) {
  return apiClient<{ taxRate: AsDto<InvoicingTaxRate> }>({ path: `${basePath(organizationId)}/tax-rates`, method: 'POST', body: taxRate });
}
export async function deleteTaxRate({ organizationId, taxRateId }: { organizationId: string; taxRateId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/tax-rates/${taxRateId}`, method: 'DELETE' });
}
export async function updateTaxRate({ organizationId, taxRateId, taxRate }: { organizationId: string; taxRateId: string; taxRate: TaxRateInput }) {
  return apiClient<{ taxRate: AsDto<InvoicingTaxRate> }>({ path: `${basePath(organizationId)}/tax-rates/${taxRateId}`, method: 'PUT', body: taxRate });
}

export async function fetchInvoiceSeries({ organizationId }: { organizationId: string }) {
  const { series } = await apiClient<{ series: AsDto<InvoiceSeries>[] }>({ path: `${basePath(organizationId)}/series`, method: 'GET' }); return { series: series.map(item => coerceDates(item) as InvoiceSeries) };
}
export async function createInvoiceSeries({ organizationId, series }: { organizationId: string; series: InvoiceSeriesInput }) {
  return apiClient<{ series: AsDto<InvoiceSeries> }>({ path: `${basePath(organizationId)}/series`, method: 'POST', body: series });
}
export async function updateInvoiceSeries({ organizationId, seriesId, series }: { organizationId: string; seriesId: string; series: InvoiceSeriesInput }) {
  return apiClient<{ series: AsDto<InvoiceSeries> }>({ path: `${basePath(organizationId)}/series/${seriesId}`, method: 'PUT', body: series });
}

export async function fetchInvoiceBranding({ organizationId }: { organizationId: string }) {
  const { branding } = await apiClient<{ branding: AsDto<InvoiceBranding> | null }>({ path: `${basePath(organizationId)}/branding`, method: 'GET' }); return { branding: branding ? coerceDates(branding) : null };
}
export async function saveInvoiceBranding({ organizationId, branding }: { organizationId: string; branding: InvoiceBrandingInput }) {
  return apiClient<{ branding: AsDto<InvoiceBranding> }>({ path: `${basePath(organizationId)}/branding`, method: 'PUT', body: branding });
}

/** Only drafts can be deleted: an issued invoice is a legal record */
export async function deleteDraftInvoice({ organizationId, invoiceId }: { organizationId: string; invoiceId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/invoices/${invoiceId}`, method: 'DELETE' });
}

export async function fetchInvoices({ organizationId }: { organizationId: string }) {
  const { invoices } = await apiClient<{ invoices: AsDto<Invoice>[] }>({ path: `${basePath(organizationId)}/invoices`, method: 'GET' });
  return { invoices: invoices.map(coerceInvoice) };
}

export async function fetchInvoice({ organizationId, invoiceId }: { organizationId: string; invoiceId: string }) {
  const { invoice } = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoices/${invoiceId}`, method: 'GET' });
  return { invoice: coerceInvoice(invoice) };
}

// An invoice issued before (or outside) the app, registered from its uploaded paper
export type ImportedInvoiceInput = Pick<InvoiceDraftInput, 'customerId' | 'issueDate' | 'dueDate' | 'currency' | 'withholdingRateBps' | 'items' | 'notes'> & { documentId: string; number: string; isPaid: boolean };

export async function importIssuedInvoice({ organizationId, invoice }: { organizationId: string; invoice: ImportedInvoiceInput }) {
  const result = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoices/import`, method: 'POST', body: invoice });
  return { invoice: coerceInvoice(result.invoice) };
}

export async function createInvoice({ organizationId, invoice }: { organizationId: string; invoice: InvoiceDraftInput }) {
  const result = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoices`, method: 'POST', body: invoice });
  return { invoice: coerceInvoice(result.invoice) };
}

export async function updateInvoice({ organizationId, invoiceId, invoice }: { organizationId: string; invoiceId: string; invoice: InvoiceDraftInput }) {
  const result = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoices/${invoiceId}`, method: 'PUT', body: invoice });
  return { invoice: coerceInvoice(result.invoice) };
}

export async function issueInvoice({ organizationId, invoiceId }: { organizationId: string; invoiceId: string }) {
  const result = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoices/${invoiceId}/issue`, method: 'POST' });
  return { invoice: coerceInvoice(result.invoice) };
}

export async function sendInvoice({ organizationId, invoiceId }: { organizationId: string; invoiceId: string }) {
  const result = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoices/${invoiceId}/send`, method: 'POST' });
  return { invoice: coerceInvoice(result.invoice) };
}

export async function markInvoicePaid({ organizationId, invoiceId }: { organizationId: string; invoiceId: string }) {
  const result = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoices/${invoiceId}/paid`, method: 'POST' });
  return { invoice: coerceInvoice(result.invoice) };
}

export async function downloadInvoicePdf({ organizationId, invoiceId, filename }: { organizationId: string; invoiceId: string; filename: string }) {
  const blob = await apiClient<Blob, 'blob'>({ path: `${basePath(organizationId)}/invoices/${invoiceId}/pdf`, method: 'GET', responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  // An imported invoice is its original paper, which can be a photo
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' } as Record<string, string>)[blob.type] ?? 'pdf';
  anchor.download = `${filename}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getInvoiceDocumentUrl({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  return `${buildTimeConfig.baseUrl}/organizations/${organizationId}/documents/${documentId}`;
}

export function coerceInvoice(invoice: AsDto<Invoice>): Invoice {
  return {
    ...invoice,
    issueDate: new Date(invoice.issueDate),
    dueDate: new Date(invoice.dueDate),
    createdAt: new Date(invoice.createdAt),
    updatedAt: new Date(invoice.updatedAt),
    issuedAt: invoice.issuedAt ? new Date(invoice.issuedAt) : null,
    sentAt: invoice.sentAt ? new Date(invoice.sentAt) : null,
    paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
    voidedAt: invoice.voidedAt ? new Date(invoice.voidedAt) : null,
    deliveryNotes: (invoice.deliveryNotes as Array<{ id: string; number: string | null; date: string | Date }> | undefined)?.map(deliveryNote => ({ ...deliveryNote, date: new Date(deliveryNote.date) })),
  } as Invoice;
}
