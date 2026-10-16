import type { ProductCatalogImportInput, ProductCatalogImportResult, ProductScanProposal } from './product-scanner.types';
import { uploadChatAttachment } from '../ai-assistant/ai-assistant.services';
import { apiClient } from '../shared/http/api-client';

// The files are stored as documents of the organization (like the assistant attachments), then read together
export async function scanProductCatalog({ organizationId, contactId, files }: { organizationId: string; contactId: string; files: File[] }) {
  const attachments = await Promise.all(files.map(async file => uploadChatAttachment({ organizationId, file })));

  return apiClient<ProductScanProposal>({
    path: `/api/organizations/${organizationId}/contacts/${contactId}/product-catalog/scan`,
    method: 'POST',
    body: { documentIds: attachments.map(({ attachment }) => attachment.documentId) },
  });
}

export async function importProductCatalog({ organizationId, contactId, input }: { organizationId: string; contactId: string; input: ProductCatalogImportInput }) {
  return apiClient<ProductCatalogImportResult>({
    path: `/api/organizations/${organizationId}/contacts/${contactId}/product-catalog/import`,
    method: 'POST',
    body: input,
  });
}
