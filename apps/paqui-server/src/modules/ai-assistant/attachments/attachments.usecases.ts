import type { ModelMessage } from 'ai';
import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import type { DocumentContent } from './attachments.models';
import type { Sheet } from './spreadsheet.parsers';
import { Buffer } from 'node:buffer';
import { and, eq, inArray } from 'drizzle-orm';
import { createDocumentNotFoundError } from '../../documents/documents.errors';
import { extractDocumentText } from '../../documents/documents.services';
import { documentsTable } from '../../documents/documents.table';
import { createLogger } from '../../shared/logger/logger';
import { collectStreamToFile } from '../../shared/streams/stream.convertion';
import { MAX_ATTACHMENT_SIZE_BYTES, MAX_INLINE_TABLE_ROWS, MAX_INLINE_TEXT_CHARS, MAX_VISION_IMAGE_BYTES, MAX_VISION_PDF_BYTES } from './attachments.constants';
import { canBeSentToVisionModel, formatDocumentContentForModel, getDocumentReadingStrategy, getInlineBudget, sliceSheet, sliceText } from './attachments.models';
import { parseCsv, parseXlsx } from './spreadsheet.parsers';

const logger = createLogger({ namespace: 'ai-assistant:attachments' });

type Document = typeof documentsTable.$inferSelect;

export type DocumentReading = {
  document: { id: string; name: string; mimeType: string; size: number };
  content: DocumentContent;
  // A photo the vision model looks at, on top of the content
  image?: { data: Buffer; mediaType: string };
  // A PDF the model looks at as it is printed (columns, boxes of totals), on top of its text
  pdf?: Buffer;
};

export async function getOrganizationDocuments({ db, organizationId, documentIds }: { db: Database; organizationId: string; documentIds: string[] }) {
  if (documentIds.length === 0) {
    return { documents: [] };
  }

  const documents = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.organizationId, organizationId), inArray(documentsTable.id, documentIds), eq(documentsTable.isDeleted, false)));

  // In the order they were attached
  return { documents: documentIds.map(id => documents.find(document => document.id === id)).filter(document => document !== undefined) };
}

export async function loadDocumentFile({ document, documentsStorageService }: { document: Document; documentsStorageService: DocumentStorageService }) {
  const { fileStream } = await documentsStorageService.getFileStream({
    storageKey: document.originalStorageKey,
    fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
    fileEncryptionKekVersion: document.fileEncryptionKekVersion,
    fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
  });

  const { file } = await collectStreamToFile({ fileStream, fileName: document.name, mimeType: document.mimeType });

  return Buffer.from(await file.arrayBuffer());
}

// Reads whatever the file is, with no template: spreadsheets as tables (columns kept), photos for the vision model,
// anything else as text (PDF text layer or OCR, Word, OpenDocument...). A file that cannot be read gives a reason,
// never an error: the assistant tells the user and goes on with the rest
export async function readDocumentForAssistant({
  document,
  documentsStorageService,
  config,
  sheetName,
  fromRow = 1,
  maxRows = MAX_INLINE_TABLE_ROWS,
  fromChar = 0,
  maxChars = MAX_INLINE_TEXT_CHARS,
  withImage = true,
}: {
  document: Document;
  documentsStorageService: DocumentStorageService;
  config: Config;
  sheetName?: string;
  fromRow?: number;
  maxRows?: number;
  fromChar?: number;
  maxChars?: number;
  withImage?: boolean;
}): Promise<DocumentReading> {
  const summary = { id: document.id, name: document.name, mimeType: document.mimeType, size: document.originalSize };
  const strategy = getDocumentReadingStrategy({ mimeType: document.mimeType, name: document.name });
  const unreadable = (reason: string): DocumentReading => ({ document: summary, content: { kind: 'unreadable', reason } });

  if (strategy === 'legacy_xls') {
    return unreadable('old binary Excel format (.xls): ask the user to save it as .xlsx or .csv and attach it again');
  }

  if (document.originalSize > MAX_ATTACHMENT_SIZE_BYTES) {
    return unreadable(`the file is too large to be read (${Math.round(document.originalSize / 1024 / 1024)} MB)`);
  }

  try {
    if (strategy === 'xlsx' || strategy === 'csv') {
      const data = await loadDocumentFile({ document, documentsStorageService });
      const sheets: Sheet[] = strategy === 'xlsx' ? await parseXlsx({ data }) : parseCsv({ text: decodeText({ data }) });
      const selected = sheetName === undefined ? sheets : sheets.filter(sheet => sheet.name === sheetName);

      if (selected.length === 0) {
        return unreadable(`no sheet named "${sheetName}", the sheets are: ${sheets.map(sheet => sheet.name).join(', ')}`);
      }

      return { document: summary, content: { kind: 'table', sheets: selected.map(sheet => sliceSheet({ sheet, fromRow, maxRows })) } };
    }

    const storedText = document.content.trim();

    if (strategy === 'image') {
      const isVisible = withImage && canBeSentToVisionModel({ mimeType: document.mimeType }) && document.originalSize <= MAX_VISION_IMAGE_BYTES;
      const data = isVisible || storedText === '' ? await loadDocumentFile({ document, documentsStorageService }) : undefined;
      // Without the vision model, the text recognized on the photo is all there is
      const text = storedText !== '' || isVisible ? storedText : await extractText({ data: data!, document, config });

      return { document: summary, content: { kind: 'image', text: text === '' ? null : text }, image: isVisible ? { data: data!, mediaType: document.mimeType } : undefined };
    }

    const isVisiblePdf = withImage && document.mimeType === 'application/pdf' && document.originalSize <= MAX_VISION_PDF_BYTES;
    // The text is extracted in the background after an upload: right after it, it is read now instead of waiting
    const data = storedText === '' ? await loadDocumentFile({ document, documentsStorageService }) : undefined;
    const text = storedText !== '' ? storedText : await extractText({ data: data!, document, config });
    // Looking at the PDF is on top of its text: without the file, the text is still there
    const pdf = isVisiblePdf ? data ?? await loadDocumentFile({ document, documentsStorageService }).catch(() => undefined) : undefined;

    if (text === '' && !pdf) {
      return unreadable('no text could be read from this file (empty, protected or unsupported format)');
    }

    return { document: summary, content: { kind: 'text', ...sliceText({ text, fromChar, maxChars }) }, pdf };
  } catch (error) {
    logger.warn({ error, documentId: document.id, mimeType: document.mimeType }, 'Document could not be read for the assistant');

    return unreadable('the file seems damaged or is not what its extension says');
  }
}

async function extractText({ data, document, config }: { data: Buffer; document: Document; config: Config }) {
  const { text } = await extractDocumentText({ file: new File([data], document.name, { type: document.mimeType }), ocrLanguages: config.documents.ocrLanguages });

  return text.trim();
}

// CSV exports from Spanish software are often Windows-1252, not UTF-8
export function decodeText({ data }: { data: Buffer }) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('windows-1252').decode(data);
  }
}

export async function getDocumentForAssistantOrThrow({ db, organizationId, documentId }: { db: Database; organizationId: string; documentId: string }) {
  const { documents: [document] } = await getOrganizationDocuments({ db, organizationId, documentIds: [documentId] });

  if (!document) {
    throw createDocumentNotFoundError();
  }

  return { document };
}

type ChatMessageWithAttachments = { role: 'user' | 'assistant' | 'system'; content: string; attachments: Document[] };

const NO_TEXT_INSTRUCTION = '(No message: the user only attached these files. Work out what they are and propose what to do with them.)';

// The files of the last user message are read and given to the model as content (tables, text, photos).
// Earlier ones were already read in their turn: they are only named, readDocumentContent reads them again if needed
export async function buildModelMessages({ messages, documentsStorageService, config }: { messages: ChatMessageWithAttachments[]; documentsStorageService: DocumentStorageService; config: Config }): Promise<ModelMessage[]> {
  const lastUserIndex = messages.findLastIndex(message => message.role === 'user');

  return Promise.all(messages.map(async (message, index): Promise<ModelMessage> => {
    if (message.role !== 'user' || message.attachments.length === 0) {
      return { role: message.role, content: message.content } as ModelMessage;
    }

    if (index !== lastUserIndex) {
      const names = message.attachments.map(document => `"${document.name}" (documentId: ${document.id})`).join(', ');
      return { role: 'user', content: `${message.content}\n\n[Attached files: ${names}]` };
    }

    const budget = getInlineBudget({ attachmentCount: message.attachments.length, maxChars: MAX_INLINE_TEXT_CHARS, maxRows: MAX_INLINE_TABLE_ROWS });
    const readings = await Promise.all(message.attachments.map(async document => readDocumentForAssistant({ document, documentsStorageService, config, ...budget })));

    return {
      role: 'user',
      content: [
        { type: 'text', text: message.content.trim() === '' ? NO_TEXT_INSTRUCTION : message.content },
        ...readings.flatMap(reading => toModelContentParts({ reading })),
      ],
    };
  }));
}

// A file as the model gets it: what was read of it, and the photo or the PDF itself to look at
export function toModelContentParts({ reading, title }: { reading: DocumentReading; title?: string }) {
  return [
    { type: 'text' as const, text: [title, formatDocumentContentForModel(reading)].filter(Boolean).join('\n') },
    ...(reading.image ? [{ type: 'image' as const, image: reading.image.data, mediaType: reading.image.mediaType }] : []),
    ...(reading.pdf ? [{ type: 'file' as const, data: reading.pdf, mediaType: 'application/pdf' }] : []),
  ];
}

// The paper shown on the user's screen (next to the form they are filling) goes with their latest message, as they
// see it: it is not an attachment of theirs, it is not saved with the conversation
export async function appendScreenDocument({ messages, db, organizationId, documentId, documentsStorageService, config }: {
  messages: ModelMessage[];
  db: Database;
  organizationId: string;
  documentId: string | undefined;
  documentsStorageService: DocumentStorageService;
  config: Config;
}): Promise<ModelMessage[]> {
  const lastUserIndex = messages.findLastIndex(message => message.role === 'user');
  const { documents: [document] } = await getOrganizationDocuments({ db, organizationId, documentIds: documentId === undefined ? [] : [documentId] });

  if (!document || lastUserIndex === -1) {
    return messages;
  }

  const reading = await readDocumentForAssistant({ document, documentsStorageService, config });
  const lastUser = messages[lastUserIndex]!;
  const content = typeof lastUser.content === 'string' ? [{ type: 'text' as const, text: lastUser.content }] : lastUser.content;
  const parts = toModelContentParts({ reading, title: '[The document open on the user\'s screen right now, next to the form: they see it as you do]' });

  return messages.map((message, index) => (index === lastUserIndex ? { role: 'user', content: [...content, ...parts] } as ModelMessage : message));
}

export function getTitleFromMessage({ content, attachments }: { content: string; attachments: { name: string }[] }) {
  const text = content.trim() || attachments.map(attachment => attachment.name).join(', ') || 'New chat';

  return text.length > 50 ? `${text.slice(0, 50)}...` : text;
}
