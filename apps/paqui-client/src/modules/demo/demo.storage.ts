import type { ApiKey } from '../api-keys/api-keys.types';
import type { CustomPropertyDefinition } from '../custom-properties/custom-properties.types';
import type { Document } from '../documents/documents.types';
import type { Organization } from '../organizations/organizations.types';
import type { TaggingRule } from '../tagging-rules/tagging-rules.types';
import type { Tag } from '../tags/tags.types';
import type { Webhook } from '../webhooks/webhooks.types';
import { createStorage, prefixStorage } from 'unstorage';
import localStorageDriver from 'unstorage/drivers/localstorage';
import { trackingServices } from '../tracking/tracking.services';
import { bindDeliveryNotesStorage, seedDemoDeliveryNotes } from './delivery-notes/demo-delivery-notes';
import { DEMO_DATA_VERSION, DEMO_IS_SEEDED_KEY } from './demo.constants';
import { createId } from './demo.models';
import { bindDueDatesStorage } from './due-dates/demo-due-dates';
import { renderDemoInvoicePdf } from './invoicing/demo-invoice-pdf';
import { attachDemoInvoiceDocument, bindInvoicingStorage, getDemoInvoicingRecords, listDemoContacts, seedDemoInvoicing } from './invoicing/demo-invoicing';
import { demoBranding, demoFiscalProfile } from './invoicing/demo-invoicing.fixtures';
import { bindPricingStorage, seedDemoPricing } from './pricing/demo-pricing';
import { attachDemoPurchaseDocument, bindPurchasesStorage, getDemoPurchaseInvoice, seedDemoPurchases } from './purchases/demo-purchases';
import { customPropertyDefinitionsFixtures } from './seed/custom-property-definitions.fixtures';
import { renderDemoDocumentPdf } from './seed/demo-document-pdf';
import { buildDemoDocumentFixtures } from './seed/documents.fixtures';
import { tagsFixtures } from './seed/tags.fixtures';

export const storage = createStorage<any>({
  driver: localStorageDriver({ base: 'demo:' }),
});

bindInvoicingStorage(storage);
bindPurchasesStorage(storage);
bindDeliveryNotesStorage(storage);
bindPricingStorage(storage);
bindDueDatesStorage(storage);

export type DocumentFileStoredFile = { name: string; size: number; type: string; base64Content: string };
export type DocumentFileRemoteFile = { name: string; path: string };
export type DocumentFile = DocumentFileStoredFile | DocumentFileRemoteFile;

export type DocumentCustomPropertyValueStorage = {
  id: string;
  documentId: string;
  propertyDefinitionId: string;
  value: unknown;
};

export const organizationStorage = prefixStorage<Organization>(storage, 'organizations');
export const documentStorage = prefixStorage<Document>(storage, 'documents');
export const documentFileStorage = prefixStorage<DocumentFile>(storage, 'documentFiles');
export const tagStorage = prefixStorage<Omit<Tag, 'documentsCount'>>(storage, 'tags');
export const tagDocumentStorage = prefixStorage<{ documentId: string; tagId: string; id: string }>(storage, 'tagDocuments');
export const taggingRuleStorage = prefixStorage<TaggingRule>(storage, 'taggingRules');
export const apiKeyStorage = prefixStorage<ApiKey>(storage, 'apiKeys');
export const webhooksStorage = prefixStorage<Webhook>(storage, 'webhooks');
export const customPropertyDefinitionStorage = prefixStorage<CustomPropertyDefinition>(storage, 'customPropertyDefinitions');
export type DemoStoredFolder = { id: string; organizationId: string; parentFolderId: string | null; contactId: string | null; name: string; kind: 'manual' | 'contact'; documentsCount: number; createdAt: string; updatedAt: string };
export const folderStorage = prefixStorage<DemoStoredFolder>(storage, 'documentFolders');
export const memberPreferencesStorage = prefixStorage<Record<string, unknown>>(storage, 'memberPreferences');
export const documentCustomPropertyValueStorage = prefixStorage<DocumentCustomPropertyValueStorage>(storage, 'documentCustomPropertyValues');

export async function clearDemoStorage() {
  await storage.clear();
  localStorage.removeItem(DEMO_IS_SEEDED_KEY);
  trackingServices.capture({ event: 'Demo storage cleared' });
}

// Simple in-memory lock to prevent concurrent seeding
let seedingPromise: Promise<void> | null = null;

export async function ensureDemoStorageSeeded() {
  // If already seeded with the current data version, return immediately
  if (localStorage.getItem(DEMO_IS_SEEDED_KEY) === DEMO_DATA_VERSION) {
    return;
  }

  // If seeding is in progress, wait for it
  if (seedingPromise) {
    return seedingPromise;
  }

  await clearDemoStorage();

  // Start seeding
  seedingPromise = seedDemoStorage()
    .then(() => {
      localStorage.setItem(DEMO_IS_SEEDED_KEY, DEMO_DATA_VERSION);
    })
    .finally(() => {
      seedingPromise = null;
    });

  return seedingPromise;
}

const idTuple = <T extends { id: string }>(item: T): [string, T] => [item.id, item];

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Stores a generated PDF as a document of the organization, the way an upload does
async function storeDemoDocument({ organizationId, name, blob, content, createdAt, folderId = null, tagIds = [] }: {
  organizationId: string;
  name: string;
  blob: Blob;
  content: string;
  createdAt: Date;
  folderId?: string | null;
  tagIds?: string[];
}) {
  const documentId = createId({ prefix: 'doc' });
  const key = `${organizationId}:${documentId}`;

  await documentStorage.setItem(key, {
    id: documentId,
    organizationId,
    name,
    mimeType: 'application/pdf',
    content,
    originalSize: blob.size,
    createdAt,
    updatedAt: createdAt,
    tags: [],
    folderId,
  } as Document);
  await documentFileStorage.setItem(key, { name: `${name}.pdf`, size: blob.size, type: 'application/pdf', base64Content: await blobToDataUrl(blob) });
  await tagDocumentStorage.setItems(tagIds.map((tagId) => {
    const id = createId({ prefix: 'tagdoc' });
    return { key: id, value: { id, documentId, tagId } };
  }));

  return { documentId };
}

// The demo is rebuilt from the visit date: invoices, expenses, documents and deadlines always look current.
export async function seedDemoStorage({ now = new Date() }: { now?: Date } = {}) {
  const organizationId = 'org_1GAP1Miap135XEcbKuBQF948'; // hard coded for better navigation on reset
  const organizationCreatedAt = daysAgo(now, 720);

  await organizationStorage.setItem(...idTuple({
    id: organizationId,
    name: 'Acme SL',
    createdAt: organizationCreatedAt,
    updatedAt: organizationCreatedAt,
  }));

  const tags = tagsFixtures.map(tag => ({
    id: createId({ prefix: 'tag' }),
    organizationId,
    name: tag.name,
    color: tag.color,
    description: tag.description,
    createdAt: organizationCreatedAt,
    updatedAt: organizationCreatedAt,
  }));
  await tagStorage.setItems(tags.map(tag => ({ key: tag.id, value: tag })));
  const tagIdsOf = (names: readonly string[]) => tags.filter(tag => names.includes(tag.name)).map(tag => tag.id);

  const customPropertyDefinitions = customPropertyDefinitionsFixtures.map((fixture, index) => ({
    id: createId({ prefix: 'cpd' }),
    organizationId,
    name: fixture.name,
    key: fixture.key,
    description: fixture.description ?? null,
    type: fixture.type,
    entityType: 'document' as const,
    displayOrder: index,
    options: fixture.options ?? [],
    createdAt: organizationCreatedAt,
    updatedAt: organizationCreatedAt,
  }));
  await customPropertyDefinitionStorage.setItems(customPropertyDefinitions.map(definition => ({ key: definition.id, value: definition })));

  await seedDemoInvoicing({ organizationId, now });
  await seedDemoPricing({ organizationId });
  const { purchaseInvoices } = await seedDemoPurchases({ organizationId, now });
  await seedDemoDeliveryNotes({ organizationId, now });

  // Folders: a few manual ones, and one per customer and supplier where their invoices get archived (as the server does)
  const createFolder = async ({ name, kind, contactId = null }: { name: string; kind: 'manual' | 'contact'; contactId?: string | null }) => {
    const stamp = organizationCreatedAt.toISOString();
    const folder: DemoStoredFolder = { id: createId({ prefix: 'fld' }), organizationId, parentFolderId: null, contactId, name, kind, documentsCount: 0, createdAt: stamp, updatedAt: stamp };
    await folderStorage.setItem(folder.id, folder);
    return folder;
  };

  const manualFolders = new Map<string, string>();
  for (const name of ['Contratos', 'Impuestos', 'Seguros', 'Banco']) {
    manualFolders.set(name, (await createFolder({ name, kind: 'manual' })).id);
  }

  const contacts = await listDemoContacts({ organizationId });
  const contactFolders = new Map<string, string>();
  for (const contact of contacts.filter(candidate => candidate.isCustomer || candidate.isSupplier)) {
    contactFolders.set(contact.id, (await createFolder({ name: contact.name, kind: 'contact', contactId: contact.id })).id);
  }

  // Documents of the studio
  for (const fixture of buildDemoDocumentFixtures({ now })) {
    const createdAt = daysAgo(now, fixture.daysAgo);
    const folderId = fixture.folder === undefined
      ? null
      : 'manual' in fixture.folder
        ? manualFolders.get(fixture.folder.manual) ?? null
        : contactFolders.get(contacts.find(contact => contact.taxId === (fixture.folder as { supplierTaxId: string }).supplierTaxId)?.id ?? '') ?? null;
    const blob = await renderDemoDocumentPdf({ title: fixture.title, lines: fixture.lines, date: createdAt, issuer: 'Acme SL · B00000000' });
    const { documentId } = await storeDemoDocument({ organizationId, name: fixture.name, blob, content: [fixture.title, ...fixture.lines].join('\n').toLowerCase(), createdAt, folderId, tagIds: tagIdsOf(fixture.tags) });

    for (const property of fixture.customProperties ?? []) {
      const definition = customPropertyDefinitions.find(candidate => candidate.key === property.key);

      if (!definition) {
        continue;
      }

      const value = property.value !== null && typeof property.value === 'object' && 'daysFromNow' in property.value
        ? daysAgo(now, -(property.value as { daysFromNow: number }).daysFromNow).toISOString().slice(0, 10)
        : property.value;

      await documentCustomPropertyValueStorage.setItem(`${documentId}:${definition.id}`, { id: createId({ prefix: 'dcpv' }), documentId, propertyDefinitionId: definition.id, value });
    }
  }

  // Issued invoices are archived as PDFs in the customer folder
  const { invoices } = await getDemoInvoicingRecords({ organizationId });
  for (const invoice of invoices.filter(candidate => candidate.status !== 'draft')) {
    const blob = await renderDemoInvoicePdf({ invoice, seller: demoFiscalProfile, branding: demoBranding });
    const { documentId } = await storeDemoDocument({
      organizationId,
      name: `Factura ${invoice.number as string}`,
      blob,
      content: `factura ${String(invoice.number).toLowerCase()} ${String(invoice.customer?.name ?? '').toLowerCase()}`,
      createdAt: new Date(invoice.issueDate as string),
      folderId: contactFolders.get(invoice.customerId as string) ?? null,
    });
    await attachDemoInvoiceDocument({ invoiceId: invoice.id as string, documentId });
  }

  // The received invoices of the last two months come with their PDF, as if the supplier sent it
  const recentPurchases = purchaseInvoices.filter(purchase => now.getTime() - purchase.issueDate.getTime() < 62 * DAY_MS);
  for (const purchase of recentPurchases) {
    const stored = await getDemoPurchaseInvoice({ purchaseInvoiceId: purchase.id });
    const supplier = contacts.find(contact => contact.taxId === purchase.supplierTaxId);

    if (!stored || !supplier) {
      continue;
    }

    const money = (minor: number) => new Intl.NumberFormat('es', { style: 'currency', currency: 'EUR' }).format(minor / 100);
    const blob = await renderDemoDocumentPdf({
      title: `Factura ${stored.number as string}`,
      lines: [
        `Emisor: ${supplier.name as string} (${supplier.taxId as string})`,
        'Cliente: Acme SL (B00000000)',
        ...(stored.items as Array<{ description: string }>).map(item => item.description),
        `Base imponible: ${money(stored.subtotalMinor as number)}`,
        `IVA: ${money(stored.taxMinor as number)}`,
        ...(Number(stored.withholdingMinor) > 0 ? [`Retención IRPF: -${money(stored.withholdingMinor as number)}`] : []),
        `Total a pagar: ${money((stored.totalMinor as number) - Number(stored.withholdingMinor ?? 0))}`,
      ],
      date: purchase.issueDate,
      issuer: supplier.name as string,
    });
    const { documentId } = await storeDemoDocument({
      organizationId,
      name: `Factura ${supplier.name as string} ${stored.number as string}`,
      blob,
      content: `factura ${String(stored.number).toLowerCase()} ${String(supplier.name).toLowerCase()}`,
      createdAt: purchase.issueDate,
      folderId: contactFolders.get(supplier.id as string) ?? null,
      tagIds: tagIdsOf(['Facturas recibidas']),
    });
    await attachDemoPurchaseDocument({ purchaseInvoiceId: purchase.id, documentId });
  }
}
