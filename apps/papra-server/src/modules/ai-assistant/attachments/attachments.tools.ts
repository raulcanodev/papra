import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import { Buffer } from 'node:buffer';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { MAX_DOCUMENT_AI_DATA_BYTES, MAX_READ_TABLE_ROWS } from './attachments.constants';
import { formatDocumentContentForModel } from './attachments.models';
import { getOrganizationDocuments, readDocumentForAssistant } from './attachments.usecases';
import { createDocumentAiDataRepository } from './document-ai-data.repository';

const documentIdSchema = z.string().min(1).max(64).describe('Document ID (from an attached file or searchDocuments)');

const readDocumentContentParams = z.object({
  documentId: documentIdSchema,
  sheetName: z.string().max(200).optional().describe('Spreadsheets: only this sheet'),
  fromRow: z.number().int().min(1).optional().describe('Spreadsheets: first row to read (1 based, as shown in the row numbers)'),
  maxRows: z.number().int().min(1).max(MAX_READ_TABLE_ROWS).optional().describe(`Spreadsheets: how many rows, up to ${MAX_READ_TABLE_ROWS}`),
  fromChar: z.number().int().min(0).optional().describe('Text documents: character to start from, to read the rest of a long document'),
});

const saveDocumentDataParams = z.object({
  documentId: documentIdSchema,
  documentType: z.string().trim().min(1).max(60).describe('What the document is, snake_case, e.g. supplier_price_list, account_statement, delivery_note, payroll, contract'),
  summary: z.string().trim().min(1).max(1_000).describe('One or two sentences: what it is, from whom, for which period, key totals'),
  dataJson: z.string().min(2).describe('The structured content as a JSON object you design for this document: consistent keys in English, amounts as numbers, dates as YYYY-MM-DD. Include everything useful, nothing invented'),
});

// Reading any file without a template, and keeping what was understood of the ones that fit no entity of the app
export function createAttachmentsTools({ db, organizationId, config, documentsStorageService }: { db: Database; organizationId: string; config: Config; documentsStorageService: DocumentStorageService }) {
  const dataRepository = createDocumentAiDataRepository({ db });

  return {
    readDocumentContent: tool({
      description: 'Read the content of any document of the organization, whatever its format and layout: spreadsheets (xlsx, csv) as tables with row numbers and column letters, PDFs and office files as text, photos as recognized text. Use it for the rest of a long attached file (next rows or characters), a specific sheet, or a document found with searchDocuments. Also returns the data saved for it earlier, if any.',
      inputSchema: zodSchema(readDocumentContentParams),
      execute: async ({ documentId, sheetName, fromRow, maxRows, fromChar }) => {
        const { documents: [document] } = await getOrganizationDocuments({ db, organizationId, documentIds: [documentId] });

        if (!document) {
          return { error: 'Document not found in this organization' };
        }

        const [{ content }, { documentAiData }] = await Promise.all([
          readDocumentForAssistant({ document, documentsStorageService, config, sheetName, fromRow, maxRows, fromChar, withImage: false }),
          dataRepository.getDocumentAiData({ organizationId, documentId }),
        ]);

        return {
          content: formatDocumentContentForModel({ document, content }),
          savedData: documentAiData ? { documentType: documentAiData.documentType, summary: documentAiData.summary, data: documentAiData.data } : null,
        };
      },
    }),

    saveDocumentData: tool({
      description: 'Save what you understood of a document as structured data, kept with the document for later questions (a supplier price list, a account statement, a delivery note with no invoice yet, any table with no matching section in the app). Do it when the user wants to keep the information and it does not belong to a contact, product, invoice or received invoice (use the dedicated tools for those). Saving again replaces the previous data of the document.',
      inputSchema: zodSchema(saveDocumentDataParams),
      execute: async ({ documentId, documentType, summary, dataJson }) => {
        const { documents: [document] } = await getOrganizationDocuments({ db, organizationId, documentIds: [documentId] });

        if (!document) {
          return { error: 'Document not found in this organization' };
        }

        if (Buffer.byteLength(dataJson) > MAX_DOCUMENT_AI_DATA_BYTES) {
          return { error: `The data is too large (max ${MAX_DOCUMENT_AI_DATA_BYTES / 1000} KB): keep the essential fields or summarize repeated rows` };
        }

        let data: unknown;
        try {
          data = JSON.parse(dataJson);
        } catch {
          return { error: 'dataJson is not valid JSON, fix it and call the tool again' };
        }

        await dataRepository.saveDocumentAiData({ organizationId, documentId, documentType, summary, data });

        return { saved: true, documentId, documentName: document.name, documentType };
      },
    }),

    listDocumentData: tool({
      description: 'List the documents whose content you saved earlier with saveDocumentData (type and summary), optionally of one type. Use it to answer from price lists, statements and other files read before, then readDocumentContent for the full data.',
      inputSchema: zodSchema(z.object({ documentType: z.string().max(60).optional() })),
      execute: async ({ documentType }) => dataRepository.listDocumentAiData({ organizationId, documentType }),
    }),
  };
}
