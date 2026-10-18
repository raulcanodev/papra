import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import type { LayoutDetector } from './pricing-import.usecases';
import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { analyzePricingImport, toSheetLayouts } from './pricing-import.usecases';

const ORG_ID = 'org_111111111111111111111111';

// Labels no rule knows: only the model can tell what each row is
const CSV = [
  'Article;Alpha;Beta',
  'Wood;10,00;12,00',
  'Haulage;2,00;2,00',
  'Agent fee;1,00;1,50',
  'Sum;13,00;15,50',
  'List;20,00;24,00',
  'Earnings;7,00;8,50',
].join('\n');

async function setup() {
  const config = overrideConfig({ env: 'test' });
  // Only reading the file is needed
  const documentsStorageService = { getFileStream: async () => ({ fileStream: new Blob([Buffer.from(CSV, 'latin1')]).stream() }) } as unknown as DocumentStorageService;
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    documents: [{ id: 'doc_1', organizationId: ORG_ID, name: 'prices.csv', originalName: 'prices.csv', mimeType: 'text/csv', originalStorageKey: 'prices-key', originalSha256Hash: 'hash1', originalSize: CSV.length }],
  });

  return { db, config, documentsStorageService };
}

describe('pricing import usecases', () => {
  test('the model answer, in row numbers and column letters, is applied to the cells and checked like the rules one', async () => {
    const { db, config, documentsStorageService } = await setup();
    const detectLayout: LayoutDetector = async ({ sheets }) => toSheetLayouts({
      sheets,
      layout: { blocks: [{ sheetName: 'CSV', title: null, headerRow: 1, variantRow: null, labelColumn: 'A', productColumns: ['B', 'C', 'Z'], rows: [
        { row: 2, role: 'cost_line' },
        { row: 3, role: 'shipping' },
        { row: 4, role: 'commission' },
        { row: 5, role: 'total_cost' },
        { row: 6, role: 'selling_price' },
        { row: 7, role: 'margin' },
      ] }] },
    });

    const proposal = await analyzePricingImport({ db, config, documentsStorageService, organizationId: ORG_ID, documentId: 'doc_1', detectLayout });

    expect([proposal.detectedWith, proposal.warnings]).to.eql(['ai', []]);
    expect(proposal.blocks[0]!.concepts.map(({ name, kind }) => [name, kind])).to.eql([['Wood', 'cost'], ['Haulage', 'shipping'], ['Agent fee', 'commission']]);
    expect(proposal.blocks[0]!.products.map(({ name, amounts, costMinor, priceMinor }) => [name, amounts, costMinor, priceMinor])).to.eql([
      ['Alpha', [1_000, 200, 100], 1_300, 2_000],
      ['Beta', [1_200, 200, 150], 1_550, 2_400],
    ]);
    expect(proposal.blocks[0]!.isBalanced).to.eql(true);
  });

  test('when the model fails, the rules read the file and the proposal says so', async () => {
    const { db, config, documentsStorageService } = await setup();

    const proposal = await analyzePricingImport({ db, config, documentsStorageService, organizationId: ORG_ID, documentId: 'doc_1', detectLayout: async () => {
      throw new Error('rate limited');
    } });

    expect([proposal.detectedWith, proposal.warnings]).to.eql(['rules', ['ai_failed']]);
    // "Sum" adds the lines above it, so the rules find the total without knowing the word
    expect(proposal.blocks[0]!.products.map(({ name, costMinor }) => [name, costMinor])).to.eql([['Alpha', 1_300], ['Beta', 1_550]]);
  });
});
