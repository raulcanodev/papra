import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import type { ColumnMapper } from './data-imports.usecases';
import { Buffer } from 'node:buffer';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { overrideConfig } from '../config/config.test-utils';
import { contactsTable } from '../contacts/contacts.table';
import { invoicingProductsTable } from '../invoicing/invoicing.tables';
import { analyzeDataImport, confirmContactsImport, confirmProductsImport } from './data-imports.usecases';

const ORG_ID = 'org_111111111111111111111111';

// Column names no rule knows: only the model can tell what each one is
const CSV = [
  'Exportación agenda;;',
  'Ident;Titular;Loc',
  'B12345678;Ferretería Pérez SL;Murcia',
  'X1234567L;Ana López;Cartagena',
].join('\n');

async function setup() {
  const config = overrideConfig({ env: 'test' });
  // Only reading the file is needed
  const documentsStorageService = { getFileStream: async () => ({ fileStream: new Blob([Buffer.from(CSV, 'utf8')]).stream() }) } as unknown as DocumentStorageService;
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    documents: [{ id: 'doc_1', organizationId: ORG_ID, name: 'agenda.csv', originalName: 'agenda.csv', mimeType: 'text/csv', originalStorageKey: 'agenda-key', originalSha256Hash: 'hash1', originalSize: CSV.length }],
  });

  return { db, config, documentsStorageService };
}

const baseContact = { existingContactId: null, kind: 'company' as const, taxId: null, email: null, phone: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, country: null, paymentTermsDays: null, notes: null };

describe('data imports usecases', () => {
  test('the model points to the header and the columns, every row is read from the cells', async () => {
    const { db, config, documentsStorageService } = await setup();
    const mapColumns: ColumnMapper = async () => ({ sheetName: 'CSV', headerRow: 2, mapping: ['taxId', 'name', 'city'] });

    const proposal = await analyzeDataImport({ db, config, documentsStorageService, organizationId: ORG_ID, documentId: 'doc_1', entity: 'contacts', mapColumns });

    expect([proposal.detectedWith, proposal.warnings, proposal.headerRow]).to.eql(['ai', [], 2]);
    expect(proposal.headers).to.eql(['Ident', 'Titular', 'Loc']);
    expect(proposal.mapping).to.eql(['taxId', 'name', 'city']);
    expect(proposal.rows).to.eql([['B12345678', 'Ferretería Pérez SL', 'Murcia'], ['X1234567L', 'Ana López', 'Cartagena']]);
  });

  test('when the model fails, the header and the columns found by the rules are proposed and the user is told', async () => {
    const { db, config, documentsStorageService } = await setup();

    const proposal = await analyzeDataImport({ db, config, documentsStorageService, organizationId: ORG_ID, documentId: 'doc_1', entity: 'contacts', mapColumns: async () => {
      throw new Error('rate limited');
    } });

    expect([proposal.detectedWith, proposal.warnings, proposal.headerRow]).to.eql(['rules', ['ai_failed'], 2]);
  });

  test('an existing contact is completed, never erased, and gets the new roles; the others are created', async () => {
    const { db } = await setup();
    const [existing] = await db.insert(contactsTable).values({ organizationId: ORG_ID, name: 'Ferretería Pérez', taxId: 'B12345678', phone: '968000000', isSupplier: true }).returning();

    const result = await confirmContactsImport({ db, organizationId: ORG_ID, input: {
      roles: { isCustomer: true, isSupplier: false, isSalesRepresentative: false },
      contacts: [
        { ...baseContact, existingContactId: existing!.id, name: 'Ferretería Pérez SL', city: 'Murcia', email: 'no es un email' },
        { ...baseContact, kind: 'person', name: 'Ana López', taxId: 'X1234567L', email: 'ana@example.com' },
      ],
    } });

    expect(result).to.eql({ createdCount: 1, updatedCount: 1 });

    const [updated] = await db.select().from(contactsTable).where(eq(contactsTable.id, existing!.id));
    expect([updated!.name, updated!.phone, updated!.city, updated!.email, updated!.isCustomer, updated!.isSupplier]).to.eql(['Ferretería Pérez SL', '968000000', 'Murcia', null, true, true]);

    const [created] = await db.select().from(contactsTable).where(eq(contactsTable.taxId, 'X1234567L'));
    expect([created!.kind, created!.email, created!.isCustomer, created!.paymentTermsDays]).to.eql(['person', 'ana@example.com', true, null]);
  });

  test('products get the defaults of the catalog for what the file does not say', async () => {
    const { db } = await setup();

    await confirmProductsImport({ db, organizationId: ORG_ID, input: { products: [{ existingProductId: null, name: 'Tornillo M6', description: null, unit: null, unitPriceMinor: 15, taxRateBps: null }] } });

    const [product] = await db.select().from(invoicingProductsTable).where(eq(invoicingProductsTable.organizationId, ORG_ID));
    expect([product!.name, product!.unit, product!.unitPriceMinor, product!.taxRateBps]).to.eql(['Tornillo M6', 'unit', 15, 2_100]);
  });
});
