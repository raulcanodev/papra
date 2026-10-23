import type { ContactRoles, DataImportEntity, DataImportProposal, DataImportResult, ImportedContact, ImportedProduct } from './data-imports.types';
import { uploadChatAttachment } from '../ai-assistant/ai-assistant.services';
import { apiClient } from '../shared/http/api-client';

// The export is stored as a document of the organization (like the assistant attachments), then read
export async function uploadDataImportFile({ organizationId, file }: { organizationId: string; file: File }) {
  const { attachment } = await uploadChatAttachment({ organizationId, file });

  return { documentId: attachment.documentId };
}

export async function analyzeDataImport({ organizationId, documentId, entity, sheetName }: { organizationId: string; documentId: string; entity: DataImportEntity; sheetName?: string }) {
  return apiClient<DataImportProposal>({ path: `/api/organizations/${organizationId}/data-imports/analyze`, method: 'POST', body: { documentId, entity, sheetName } });
}

export async function confirmContactsImport({ organizationId, roles, contacts }: { organizationId: string; roles: ContactRoles; contacts: ImportedContact[] }) {
  return apiClient<DataImportResult>({ path: `/api/organizations/${organizationId}/data-imports/contacts/confirm`, method: 'POST', body: { roles, contacts } });
}

export async function confirmProductsImport({ organizationId, products }: { organizationId: string; products: ImportedProduct[] }) {
  return apiClient<DataImportResult>({ path: `/api/organizations/${organizationId}/data-imports/products/confirm`, method: 'POST', body: { products } });
}
