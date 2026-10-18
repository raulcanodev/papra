import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { createDueDatesRepository } from '../../due-dates/due-dates.repository';
import { dismissPurchaseInboxDocument, listPurchaseInbox, queueIntakeDocumentReading } from './document-readings.inbox';
import { documentReadingsTable } from './document-readings.tables';

const ORG_ID = 'org_111111111111111111111111';

const document = (id: string, mimeType = 'application/pdf') => ({ id, organizationId: ORG_ID, name: `${id}.pdf`, originalName: `${id}.pdf`, mimeType, originalStorageKey: id, originalSha256Hash: id });

describe('purchase inbox', () => {
  test('a readable document received by email is queued for reading and waits in the inbox until registered or dismissed, unless the organization turned it off', async () => {
    const { db } = await createInMemoryDatabase({ organizations: [{ id: ORG_ID, name: 'Acme' }], documents: [document('doc_pdf'), document('doc_zip', 'application/zip'), document('doc_later')] });
    const scheduled: string[] = [];
    // A web process only tells the worker: nothing is read during the test
    const deps = { db, config: overrideConfig({ env: 'test', processMode: 'web' }), documentsStorageService: {} as never, taskServices: { scheduleJob: async ({ taskName }: { taskName: string }) => void scheduled.push(taskName) } as never, organizationId: ORG_ID };

    expect(await queueIntakeDocumentReading({ ...deps, document: { id: 'doc_pdf', mimeType: 'application/pdf', originalSize: 1_000 } })).to.eql({ isQueued: true });
    expect(await queueIntakeDocumentReading({ ...deps, document: { id: 'doc_zip', mimeType: 'application/zip', originalSize: 1_000 } })).to.eql({ isQueued: false });
    expect(scheduled).to.eql(['process-document-readings']);

    const { readings } = await listPurchaseInbox({ db, organizationId: ORG_ID });
    expect(readings.map(({ documentId, status, documentName }) => ({ documentId, status, documentName }))).to.eql([{ documentId: 'doc_pdf', status: 'pending', documentName: 'doc_pdf.pdf' }]);

    await dismissPurchaseInboxDocument({ db, organizationId: ORG_ID, documentId: 'doc_pdf' });
    expect((await listPurchaseInbox({ db, organizationId: ORG_ID })).readings).to.eql([]);

    await createDueDatesRepository({ db }).saveSettings({ organizationId: ORG_ID, settings: { emailRemindersEnabled: false, reminderEmail: null, reminderDaysBefore: 3, readIntakeEmailAttachments: false } });
    expect(await queueIntakeDocumentReading({ ...deps, document: { id: 'doc_later', mimeType: 'application/pdf', originalSize: 1_000 } })).to.eql({ isQueued: false });
    expect(await db.select().from(documentReadingsTable)).to.eql([]);
  });
});
