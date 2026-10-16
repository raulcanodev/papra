import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import type { InvoiceReader } from '../purchases.extraction.usecases';
import type { StoredPurchaseExtraction } from './document-readings.models';
import type { DocumentReading, DocumentReadingsRepository } from './document-readings.repository';
import { and, eq, inArray } from 'drizzle-orm';
import { createContactsRepository } from '../../contacts/contacts.repository';
import { documentsTable } from '../../documents/documents.table';
import { createLogger } from '../../shared/logger/logger';
import { extractPurchaseInvoiceFromDocument } from '../purchases.extraction.usecases';
import { DOCUMENT_READINGS_CONCURRENCY, MAX_DOCUMENT_READING_ATTEMPTS, STALE_READING_AFTER_MS } from './document-readings.constants';
import { checkExtraction, formatReadingForApi, getReadingErrorCode, getReadingStatusFromChecks, isRetryableReadingError } from './document-readings.models';
import { createDocumentReadingsRepository } from './document-readings.repository';

const logger = createLogger({ namespace: 'purchases:document-readings' });

type ReadingDependencies = { db: Database; config: Config; documentsStorageService: DocumentStorageService; readInvoice?: InvoiceReader };

// Reads one document with the AI and checks the result; on failure it is retried once, then marked failed.
// Never throws: one bad file must not stop the others
export async function processDocumentReading({ reading, db, config, documentsStorageService, readInvoice, readingsRepository = createDocumentReadingsRepository({ db }) }: ReadingDependencies & { reading: DocumentReading; readingsRepository?: DocumentReadingsRepository }) {
  try {
    const extraction = await extractPurchaseInvoiceFromDocument({ organizationId: reading.organizationId, documentId: reading.documentId, db, config, documentsStorageService, readInvoice });
    const checks = checkExtraction({ extraction: extraction as StoredPurchaseExtraction });

    await readingsRepository.finishReading({ readingId: reading.id, status: getReadingStatusFromChecks({ checks }), result: extraction as unknown as Record<string, unknown>, checks });
  } catch (error) {
    const errorCode = getReadingErrorCode({ error });
    const willRetry = isRetryableReadingError({ errorCode }) && reading.attempts < MAX_DOCUMENT_READING_ATTEMPTS;

    logger.warn({ error, readingId: reading.id, documentId: reading.documentId, errorCode, willRetry }, 'Document reading failed');

    await readingsRepository.finishReading({ readingId: reading.id, status: willRetry ? 'pending' : 'failed', errorCode });
  }
}

export type DocumentReadingsRunner = ReturnType<typeof createDocumentReadingsRunner>;

// Reads several documents at the same time (the AI call is the slow part) up to a limit, claiming them from the
// database: a wake-up while it is already running just makes it look for more work
export function createDocumentReadingsRunner({ concurrency = DOCUMENT_READINGS_CONCURRENCY, ...deps }: ReadingDependencies & { concurrency?: number }) {
  const readingsRepository = createDocumentReadingsRepository({ db: deps.db });
  const inFlight = new Set<Promise<void>>();
  let draining: Promise<void> | undefined;

  async function drain() {
    while (inFlight.size < concurrency) {
      const { readings } = await readingsRepository.claimPendingReadings({ limit: concurrency - inFlight.size });

      if (readings.length === 0) {
        return;
      }

      for (const reading of readings) {
        const processing = processDocumentReading({ ...deps, reading, readingsRepository }).finally(() => {
          inFlight.delete(processing);
          void wake();
        });
        inFlight.add(processing);
      }
    }
  }

  async function wake() {
    draining ??= drain()
      .catch(error => logger.error({ error }, 'Error while claiming document readings'))
      .finally(() => {
        draining = undefined;
      });

    return draining;
  }

  // Readings interrupted by a restart go back to the queue before looking for work
  const sweep = async ({ now = new Date() }: { now?: Date } = {}) => {
    const { requeuedCount } = await readingsRepository.requeueStaleReadings({ staleBefore: new Date(now.getTime() - STALE_READING_AFTER_MS) });

    if (requeuedCount > 0) {
      logger.info({ requeuedCount }, 'Interrupted document readings requeued');
    }

    return wake();
  };

  // For tests and graceful shutdowns
  const waitUntilIdle = async () => {
    const isBusy = () => draining !== undefined || inFlight.size > 0;
    while (isBusy()) {
      await Promise.all([draining, ...inFlight]);
    }
  };

  return { wake, sweep, waitUntilIdle };
}

// One runner per process: every wake-up of the process reaches the same concurrency limit
const runners = new WeakMap<Database, DocumentReadingsRunner>();

export function getDocumentReadingsRunner(deps: ReadingDependencies) {
  const existing = runners.get(deps.db);
  if (existing) {
    return existing;
  }

  const runner = createDocumentReadingsRunner(deps);
  runners.set(deps.db, runner);

  return runner;
}

// Only documents of the organization can be read for it
export async function filterOrganizationDocumentIds({ db, organizationId, documentIds }: { db: Database; organizationId: string; documentIds: string[] }) {
  if (documentIds.length === 0) {
    return { documentIds: [] };
  }

  const rows = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(eq(documentsTable.organizationId, organizationId), inArray(documentsTable.id, documentIds), eq(documentsTable.isDeleted, false)));

  const existingIds = new Set(rows.map(({ id }) => id));

  return { documentIds: [...new Set(documentIds)].filter(id => existingIds.has(id)) };
}

export async function formatReadingsForApi({ db, organizationId, readings }: { db: Database; organizationId: string; readings: DocumentReading[] }) {
  const { contacts } = await createContactsRepository({ db }).listContacts({ organizationId });

  return { readings: readings.map(reading => formatReadingForApi({ reading, contacts })) };
}

// The synchronous path (the assistant or the API reading one document): a reading already done is given back at once,
// otherwise the document is read now and the result kept for the review screen
export async function getOrReadPurchaseDocument({ organizationId, documentId, readInvoice, ...deps }: ReadingDependencies & { organizationId: string; documentId: string }) {
  const readingsRepository = createDocumentReadingsRepository({ db: deps.db });
  const { readings: [existing] } = await readingsRepository.getReadings({ organizationId, documentIds: [documentId], kind: 'purchase' });

  if (existing && (existing.status === 'ready' || existing.status === 'needs_review')) {
    const { readings: [formatted] } = await formatReadingsForApi({ db: deps.db, organizationId, readings: [existing] });
    return formatted!;
  }

  const extraction = await extractPurchaseInvoiceFromDocument({ organizationId, documentId, readInvoice, ...deps });
  const checks = checkExtraction({ extraction: extraction as StoredPurchaseExtraction });
  const { reading } = await readingsRepository.saveReading({ organizationId, documentId, kind: 'purchase', status: getReadingStatusFromChecks({ checks }), result: extraction as unknown as Record<string, unknown>, checks });
  const { readings: [formatted] } = await formatReadingsForApi({ db: deps.db, organizationId, readings: [reading] });

  return formatted!;
}
