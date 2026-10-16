export const DOCUMENT_READING_ID_PREFIX = 'drd';

// pending: waiting in the queue, reading: the AI is on it, ready: read and every check passed,
// needs_review: read but a check failed (total, tax id...), failed: could not be read after the retries
export const DOCUMENT_READING_STATUSES = ['pending', 'reading', 'ready', 'needs_review', 'failed'] as const;
export type DocumentReadingStatus = typeof DOCUMENT_READING_STATUSES[number];

// What the document is read as; only received invoices, tickets and delivery notes for now
export const DOCUMENT_READING_KINDS = ['purchase'] as const;
export type DocumentReadingKind = typeof DOCUMENT_READING_KINDS[number];

// Several documents are read at once (the AI call is the slow part), without overloading the provider rate limits
export const DOCUMENT_READINGS_CONCURRENCY = 3;
export const MAX_DOCUMENT_READING_ATTEMPTS = 2;
export const MAX_DOCUMENTS_PER_READING_REQUEST = 50;

// A reading left in "reading" this long was interrupted (restart, crash): it goes back to the queue
export const STALE_READING_AFTER_MS = 5 * 60 * 1_000;

export const PROCESS_DOCUMENT_READINGS_TASK_NAME = 'process-document-readings';
// The safety net: picks up anything a lost wake-up signal or a restart left behind
export const DOCUMENT_READINGS_SWEEP_CRON = '* * * * *';
