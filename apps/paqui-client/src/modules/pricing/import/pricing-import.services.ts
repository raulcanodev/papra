import type { PricingImportInput, PricingImportProposal, PricingImportResult } from './pricing-import.types';
import { uploadChatAttachment } from '../../ai-assistant/ai-assistant.services';
import { apiClient } from '../../shared/http/api-client';

// The spreadsheet is stored as a document of the organization (like the assistant attachments), then read
export async function analyzePricingImport({ organizationId, file }: { organizationId: string; file: File }) {
  const { attachment } = await uploadChatAttachment({ organizationId, file });

  return apiClient<PricingImportProposal>({ path: `/api/organizations/${organizationId}/pricing/imports/analyze`, method: 'POST', body: { documentId: attachment.documentId } });
}

export async function confirmPricingImport({ organizationId, input }: { organizationId: string; input: PricingImportInput }) {
  return apiClient<PricingImportResult>({ path: `/api/organizations/${organizationId}/pricing/imports/confirm`, method: 'POST', body: input });
}
