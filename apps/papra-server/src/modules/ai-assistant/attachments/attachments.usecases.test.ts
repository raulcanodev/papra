import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { documentsTable } from '../../documents/documents.table';
import { createAttachmentsTools } from './attachments.tools';
import { buildModelMessages, decodeText, getTitleFromMessage, readDocumentForAssistant } from './attachments.usecases';

const ORG_ID = 'org_111111111111111111111111';

const files: Record<string, Buffer> = {
  'clientes.csv': Buffer.from('Nombre;NIF\nAcme SL;B12345678\nPapelería Sol;B87654321\n'),
  'ticket.jpg': Buffer.from('jpeg bytes'),
  'roto.xlsx': Buffer.from('this is not a zip'),
};

// Each document file is its name in this fake storage
const documentsStorageService = { getFileStream: async ({ storageKey }: { storageKey: string }) => ({ fileStream: Readable.from([files[storageKey]!]) }) } as never;
const config = overrideConfig({ env: 'test' });

const document = (name: string, mimeType: string, overrides: { content?: string; originalSize?: number } = {}) => ({ id: `doc_${name.replace(/\W/g, '')}`, organizationId: ORG_ID, name, originalName: name, mimeType, originalStorageKey: name, originalSha256Hash: name, originalSize: files[name]?.length ?? 10, ...overrides });

async function setup() {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    documents: [
      document('clientes.csv', 'text/csv'),
      document('ticket.jpg', 'image/jpeg', { content: 'MERCADONA TOTAL 12,30' }),
      document('roto.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      document('viejo.xls', 'application/vnd.ms-excel'),
      document('contrato.pdf', 'application/pdf', { content: 'Contrato de arrendamiento' }),
    ],
  });
  const [...documents] = await db.select().from(documentsTable);
  const byName = (name: string) => documents.find(item => item.name === name)!;

  return { db, byName };
}

describe('attachments usecases', () => {
  test('any file is read without template, and a file that cannot be read gives a reason instead of an error', async () => {
    const { byName } = await setup();
    const read = async (name: string) => (await readDocumentForAssistant({ document: byName(name), documentsStorageService, config })).content;

    expect(await read('clientes.csv')).toEqual({ kind: 'table', sheets: [{ name: 'CSV', rowCount: 3, columnCount: 2, fromRow: 1, hasMore: false, rows: [['Nombre', 'NIF'], ['Acme SL', 'B12345678'], ['Papelería Sol', 'B87654321']] }] });
    expect(await read('contrato.pdf')).toMatchObject({ kind: 'text', text: 'Contrato de arrendamiento', hasMore: false });
    expect(await read('roto.xlsx')).toEqual({ kind: 'unreadable', reason: 'the file seems damaged or is not what its extension says' });
    expect(await read('viejo.xls')).toEqual({ kind: 'unreadable', reason: 'old binary Excel format (.xls): ask the user to save it as .xlsx or .csv and attach it again' });
  });

  test('a photo goes to the vision model with the text recognized on it', async () => {
    const { byName } = await setup();

    const reading = await readDocumentForAssistant({ document: byName('ticket.jpg'), documentsStorageService, config });

    expect(reading.content).toEqual({ kind: 'image', text: 'MERCADONA TOTAL 12,30' });
    expect(reading.image).toEqual({ data: files['ticket.jpg'], mediaType: 'image/jpeg' });
  });

  test('the files of the last message are given to the model as content, earlier ones only named', async () => {
    const { byName } = await setup();

    const messages = await buildModelMessages({
      documentsStorageService,
      config,
      messages: [
        { role: 'user', content: 'Mira este contrato', attachments: [byName('contrato.pdf')] },
        { role: 'assistant', content: 'Es un contrato de arrendamiento.', attachments: [] },
        { role: 'user', content: '', attachments: [byName('clientes.csv'), byName('ticket.jpg')] },
      ],
    });

    expect(messages[0]).toEqual({ role: 'user', content: 'Mira este contrato\n\n[Attached files: "contrato.pdf" (documentId: doc_contratopdf)]' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Es un contrato de arrendamiento.' });

    const parts = messages[2]!.content as Array<{ type: string; text?: string }>;
    expect(parts.map(part => part.type)).toEqual(['text', 'text', 'text', 'image']);
    expect(parts[0]!.text).toContain('the user only attached these files');
    expect(parts[1]!.text).toContain('| 2 | Acme SL | B12345678 |');
    expect(parts[2]!.text).toContain('MERCADONA TOTAL 12,30');
  });

  test('csv exports in Windows-1252 are decoded, the chat title falls back to the file names', () => {
    expect(decodeText({ data: Buffer.from([0x50, 0x61, 0x70, 0x65, 0x6C, 0x65, 0x72, 0xED, 0x61]) })).toBe('Papelería');
    expect(getTitleFromMessage({ content: '  ', attachments: [{ name: 'tarifa.xlsx' }, { name: 'ticket.jpg' }] })).toBe('tarifa.xlsx, ticket.jpg');
  });

  test('the assistant keeps what it understood of a document and finds it again, only in its organization', async () => {
    const { db } = await setup();
    const tools = createAttachmentsTools({ db, organizationId: ORG_ID, config, documentsStorageService });
    const run = async <T>(toolName: keyof typeof tools, input: unknown) => (tools[toolName].execute as (input: unknown, options: unknown) => Promise<T>)(input, {});

    expect(await run('saveDocumentData', { documentId: 'doc_clientescsv', documentType: 'customer_list', summary: 'Dos clientes', dataJson: '{not json' })).toEqual({ error: 'dataJson is not valid JSON, fix it and call the tool again' });
    expect(await run('saveDocumentData', { documentId: 'doc_unknown', documentType: 'x', summary: 'x', dataJson: '{}' })).toEqual({ error: 'Document not found in this organization' });

    await run('saveDocumentData', { documentId: 'doc_clientescsv', documentType: 'customer_list', summary: 'Dos clientes', dataJson: '{"customers":[{"name":"Acme SL"}]}' });
    await run('saveDocumentData', { documentId: 'doc_clientescsv', documentType: 'customer_list', summary: 'Dos clientes con NIF', dataJson: '{"customers":[{"name":"Acme SL","taxId":"B12345678"}]}' });

    const { documentAiData } = await run<{ documentAiData: unknown[] }>('listDocumentData', { documentType: 'customer_list' });
    expect(documentAiData).toMatchObject([{ documentId: 'doc_clientescsv', summary: 'Dos clientes con NIF' }]);

    const read = await run<{ content: string; savedData: unknown }>('readDocumentContent', { documentId: 'doc_clientescsv', fromRow: 3 });
    expect(read.content).toContain('| 3 | Papelería Sol | B87654321 |');
    expect(read.content).not.toContain('Acme SL');
    expect(read.savedData).toEqual({ documentType: 'customer_list', summary: 'Dos clientes con NIF', data: { customers: [{ name: 'Acme SL', taxId: 'B12345678' }] } });
  });
});
