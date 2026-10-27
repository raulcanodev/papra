import type { InvoiceExtraction } from '../purchases.extraction.models';
import type { InvoiceReader } from '../purchases.extraction.usecases';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { contactsTable } from '../../contacts/contacts.table';
import { createDocumentReadingsRepository } from './document-readings.repository';
import { documentReadingsTable } from './document-readings.tables';
import { createDocumentReadingsRunner, formatReadingsForApi, getOrReadPurchaseDocument } from './document-readings.usecases';

const ORG_ID = 'org_111111111111111111111111';
const config = overrideConfig({ env: 'test' });
const party = (name: string | null, taxId: string | null) => ({ name, taxId, email: null, phone: null, addressLine1: null, postalCode: null, city: null, country: 'ES', bankAccount: null });

function extraction(overrides: Partial<InvoiceExtraction> = {}): InvoiceExtraction {
  return {
    documentKind: 'invoice',
    issuer: party('Nube Hosting SL', 'B12345674'),
    recipient: party('Acme SL', null),
    number: 'NUBE-1',
    issueDate: '2026-09-30',
    dueDate: null,
    paymentMethod: null,
    paymentTerms: [],
    currency: 'EUR',
    lines: [{ description: 'Hosting', quantity: 1, unitPrice: 100, taxRatePercent: 21, discountPercent: 0 }],
    withholdingRatePercent: 0,
    total: 121,
    category: 'software',
    metadata: [],
    warnings: [],
    ...overrides,
  };
}

async function setup({ documentCount = 1, mimeType = 'application/pdf' }: { documentCount?: number; mimeType?: string } = {}) {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    documents: Array.from({ length: documentCount }, (_, index) => ({ id: `doc_${index + 1}`, organizationId: ORG_ID, name: `f${index}.pdf`, originalName: `f${index}.pdf`, mimeType, originalStorageKey: `k${index}`, originalSha256Hash: `h${index}`, content: `Factura ${index + 1}` })),
  });
  const repository = createDocumentReadingsRepository({ db });
  const documentIds = Array.from({ length: documentCount }, (_, index) => `doc_${index + 1}`);
  const statuses = async () => Object.fromEntries((await db.select().from(documentReadingsTable)).map(reading => [reading.documentId, [reading.status, reading.attempts, reading.errorCode]]));

  return { db, repository, documentIds, statuses };
}

describe('document readings', () => {
  test('queued documents are read in parallel up to the limit, each checked and kept', async () => {
    const { db, repository, documentIds, statuses } = await setup({ documentCount: 5 });
    let running = 0;
    let maxRunning = 0;
    const readInvoice: InvoiceReader = async ({ text }) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(resolve => setTimeout(resolve, 10));
      running--;
      // The third one does not add up: its total is misread
      return extraction(text === 'Factura 3' ? { total: 999 } : {});
    };

    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds, kind: 'purchase' });
    const runner = createDocumentReadingsRunner({ db, config, documentsStorageService: {} as never, readInvoice, concurrency: 2 });
    await runner.wake();
    await runner.waitUntilIdle();

    expect(maxRunning).toBe(2);
    expect(await statuses()).toEqual({
      doc_1: ['ready', 1, null],
      doc_2: ['ready', 1, null],
      doc_3: ['needs_review', 1, null],
      doc_4: ['ready', 1, null],
      doc_5: ['ready', 1, null],
    });
  });

  test('a failed reading is retried once, then marked failed; an unreadable file fails at once', async () => {
    const { db, repository, statuses } = await setup({ documentCount: 2 });
    let calls = 0;
    const flaky: InvoiceReader = async () => {
      calls++;
      if (calls === 1) {
        throw new Error('rate limited');
      }
      return extraction();
    };

    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds: ['doc_1'], kind: 'purchase' });
    const runner = createDocumentReadingsRunner({ db, config, documentsStorageService: {} as never, readInvoice: flaky });
    await runner.wake();
    await runner.waitUntilIdle();
    expect((await statuses()).doc_1).toEqual(['ready', 2, null]);

    const broken: InvoiceReader = async () => {
      throw new Error('provider down');
    };
    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds: ['doc_2'], kind: 'purchase' });
    const brokenRunner = createDocumentReadingsRunner({ db, config, documentsStorageService: {} as never, readInvoice: broken });
    await brokenRunner.wake();
    await brokenRunner.waitUntilIdle();
    expect((await statuses()).doc_2).toEqual(['failed', 2, 'purchase_invoice.extraction_failed']);
  });

  test('a file the AI cannot read is not retried', async () => {
    const { db, repository, statuses } = await setup({ mimeType: 'text/plain' });

    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds: ['doc_1'], kind: 'purchase' });
    const runner = createDocumentReadingsRunner({ db, config, documentsStorageService: {} as never, readInvoice: async () => extraction() });
    await runner.wake();
    await runner.waitUntilIdle();

    expect((await statuses()).doc_1).toEqual(['failed', 1, 'purchase_invoice.document_not_extractable']);
  });

  test('a reading interrupted by a restart goes back to the queue and is read', async () => {
    const { db, repository, statuses } = await setup();
    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds: ['doc_1'], kind: 'purchase' });
    // Claimed by a process that died 10 minutes ago
    await repository.claimPendingReadings({ limit: 1, now: new Date(Date.now() - 10 * 60 * 1_000) });

    const runner = createDocumentReadingsRunner({ db, config, documentsStorageService: {} as never, readInvoice: async () => extraction() });
    await runner.sweep();
    await runner.waitUntilIdle();

    expect((await statuses()).doc_1).toEqual(['ready', 2, null]);
  });

  test('queuing is idempotent: a read document is not read again unless forced, a failed one is retried', async () => {
    const { db, repository, statuses } = await setup({ documentCount: 2 });
    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds: ['doc_1', 'doc_2'], kind: 'purchase' });
    const [first, second] = (await db.select().from(documentReadingsTable)).toSorted((a, b) => a.documentId.localeCompare(b.documentId));
    await repository.finishReading({ readingId: first!.id, status: 'ready', result: {}, checks: [] });
    await repository.finishReading({ readingId: second!.id, status: 'failed', errorCode: 'x' });

    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds: ['doc_1', 'doc_2'], kind: 'purchase' });
    expect(await statuses()).toEqual({ doc_1: ['ready', 0, null], doc_2: ['pending', 0, null] });

    await repository.enqueueReadings({ organizationId: ORG_ID, documentIds: ['doc_1'], kind: 'purchase', force: true });
    expect((await statuses()).doc_1).toEqual(['pending', 0, null]);
  });

  test('a stored reading is served with today\'s contacts: a supplier created since is recognized, without calling the AI again', async () => {
    const { db } = await setup();
    let calls = 0;
    const readInvoice: InvoiceReader = async () => {
      calls++;
      return extraction({ issuer: party('Ferretería López', null) });
    };
    const read = async () => getOrReadPurchaseDocument({ organizationId: ORG_ID, documentId: 'doc_1', db, config, documentsStorageService: {} as never, readInvoice });

    const before = await read();
    expect(before.extraction).toMatchObject({ counterparty: { status: 'create', contactId: null }, draft: { supplierId: null } });

    await db.insert(contactsTable).values({ id: 'ctc_lopez', organizationId: ORG_ID, name: 'FERRETERIA LOPEZ S.L.', isSupplier: true });

    const after = await read();
    expect(after).toMatchObject({ status: 'ready', extraction: { counterparty: { status: 'matched', matchedBy: 'name', contactId: 'ctc_lopez' }, draft: { supplierId: 'ctc_lopez' } } });
    expect(calls).toBe(1);

    const { readings } = await formatReadingsForApi({ db, organizationId: ORG_ID, readings: await db.select().from(documentReadingsTable) });
    expect(readings[0]!.extraction!.draft.issueDate).toBe('2026-09-30T00:00:00.000Z');
  });
});
