// Files a user can attach to one message of the assistant
export const MAX_CHAT_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;

// What goes to the model directly in the message: beyond this, the assistant reads the rest with readDocumentContent
export const MAX_INLINE_TEXT_CHARS = 30_000;
export const MAX_INLINE_TABLE_ROWS = 150;
export const MAX_READ_TABLE_ROWS = 500;
export const MAX_TABLE_CELL_CHARS = 300;

// Photos are sent to the vision model only up to this size, larger ones are read from their recognized text
export const MAX_VISION_IMAGE_BYTES = 5 * 1024 * 1024;
// PDFs are sent as they are (the model sees their layout) up to this size, larger ones only as text
export const MAX_VISION_PDF_BYTES = 10 * 1024 * 1024;
export const VISION_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const XLSX_MIME_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroEnabled.12'];
export const CSV_MIME_TYPES = ['text/csv', 'text/tab-separated-values', 'application/csv'];
// Old binary Excel files: no parser, the user is asked for the .xlsx or .csv export
export const LEGACY_XLS_MIME_TYPES = ['application/vnd.ms-excel'];

// The interpretation the assistant saves for a document that matches no entity of the app (a price list, a account statement...)
export const MAX_DOCUMENT_AI_DATA_BYTES = 200_000;
