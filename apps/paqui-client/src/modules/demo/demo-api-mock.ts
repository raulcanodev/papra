import type { ApiKey } from '../api-keys/api-keys.types';
import type { CustomPropertyDefinition } from '../custom-properties/custom-properties.types';
import type { Document } from '../documents/documents.types';
import type { MemberPreferences, MemberPreferencesPatch } from '../preferences/preferences.types';
import type { Webhook } from '../webhooks/webhooks.types';
import type {
  DocumentCustomPropertyValueStorage,
  DocumentFile,
} from './demo.storage';
import { FetchError } from 'ofetch';
import { createRouter } from 'radix3';
import { applyPreferencesPatch } from '../preferences/preferences.models';
import { DEFAULT_MEMBER_PREFERENCES } from '../preferences/preferences.types';
import { get } from '../shared/utils/get';
import { aiHandlers } from './ai/demo-ai';
import { capturesHandlers } from './captures/demo-captures';
import { computeDemoDashboardMetrics } from './dashboard/demo-dashboard';
import { dataImportsHandlers } from './data-imports/demo-data-imports';
import { deliveryNotesHandlers } from './delivery-notes/demo-delivery-notes';
import { defineHandler } from './demo-api-mock.models';
import { createId, randomString } from './demo.models';
import {
  apiKeyStorage,
  customPropertyDefinitionStorage,
  documentCustomPropertyValueStorage,
  documentFileStorage,
  documentStorage,
  folderStorage,
  memberPreferencesStorage,
  organizationStorage,
  tagDocumentStorage,
  taggingRuleStorage,
  tagStorage,
  webhooksStorage,
} from './demo.storage';
import { findMany, getValues } from './demo.storage.models';
import { dueDatesHandlers } from './due-dates/demo-due-dates';
import { gestoriasHandlers } from './gestorias/demo-gestorias';
import { contactsHandlers, getDemoContact, getDemoEntityCustomPropertyValues, getDemoFiscalProfile, getDemoInvoicingRecords, invoicingHandlers, listDemoContacts } from './invoicing/demo-invoicing';
import { miscHandlers } from './misc/demo-misc';
import { pricingHandlers } from './pricing/demo-pricing';
import { pricingImportHandlers } from './pricing/demo-pricing-import';
import { productScannerHandlers } from './product-scanner/demo-product-scanner';
import { buildDemoExtraction, listDemoPurchaseInvoices, purchasesHandlers } from './purchases/demo-purchases';
import { generatePropertyKey, searchDemoDocuments } from './search/demo.search.services';
import { demoUser } from './seed/users.fixtures';
import { computeDemoQuarterlyTaxReport } from './taxes/demo-taxes';

function assert(condition: unknown, { message = 'Error', status }: { message?: string; status?: number } = {}): asserts condition {
  if (!condition) {
    throw Object.assign(new FetchError(message), { status });
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

function fromBase64(base64: string) {
  return fetch(base64).then(res => res.blob());
}

async function serializeFile(file: File): Promise<DocumentFile> {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    // base64
    base64Content: await toBase64(file),
  };
}

async function deserializeFile(storageInfo: DocumentFile): Promise<File> {
  if ('path' in storageInfo) {
    const { path, name } = storageInfo;
    const response = await fetch(path);
    const blob = await response.blob();
    return new File([blob], name);
  }

  const { name, type, base64Content } = storageInfo;

  return new File([await fromBase64(base64Content)], name, { type });
}

const demoReadings = new Map<string, ReturnType<typeof buildDemoExtraction>>();

async function getDemoReadings({ organizationId, documentIds }: { organizationId: string; documentIds: string[] }) {
  const documents = await Promise.all(documentIds.map(async documentId => documentStorage.getItem(`${organizationId}:${documentId}`)));

  return documentIds
    .filter((_, index) => documents[index])
    .map((documentId) => {
      const extraction = demoReadings.get(documentId) ?? buildDemoExtraction({ documentId, documentName: String((documents[documentIds.indexOf(documentId)] as { name?: unknown } | null)?.name ?? '') });
      demoReadings.set(documentId, extraction);
      return { documentId, status: 'ready', errorCode: null, checks: [], extraction };
    });
}

function throwDemoNotAvailable(): never {
  throw Object.assign(new FetchError('Not available in demo'), { status: 501, data: { error: { message: 'This feature is not available in demo', code: 'demo.not_available' } } });
}

// Same output as the server entity custom properties: stored raw values (definition id to value) formatted per type
async function formatDemoEntityCustomProperties({ organizationId, entityTypes, entityId }: { organizationId: string; entityTypes: readonly string[]; entityId: string }) {
  const [definitions, rawValues] = await Promise.all([
    findMany(customPropertyDefinitionStorage, def => def.organizationId === organizationId && entityTypes.includes(def.entityType)),
    Promise.all(entityTypes.map(async entityType => getDemoEntityCustomPropertyValues({ organizationId, entityType, entityId }))).then(values => Object.assign({}, ...values) as Record<string, unknown>),
  ]);

  return definitions
    .filter(definition => rawValues[definition.id] !== undefined && rawValues[definition.id] !== null)
    .map((definition) => {
      const raw = rawValues[definition.id];
      const toOption = (optionId: unknown) => {
        const option = definition.options.find(({ id }) => id === optionId);
        return option ? { optionId: option.id, name: option.name } : null;
      };

      const value = definition.type === 'select'
        ? toOption(raw)
        : definition.type === 'multi_select'
          ? (raw as unknown[]).map(toOption).filter(Boolean)
          : raw;

      return { propertyDefinitionId: definition.id, key: definition.key, name: definition.name, type: definition.type, value };
    });
}

function hydratePropertyValue({ value, definition }: { value: unknown; definition: CustomPropertyDefinition }): unknown {
  if (value == null) {
    return null;
  }

  if (definition.type === 'select') {
    const optionId = String(value);
    const option = definition.options.find(o => o.id === optionId || o.key === optionId);

    if (!option) {
      return null;
    }

    return { optionId: option.id, name: option.name };
  }

  if (definition.type === 'multi_select') {
    const ids = Array.isArray(value) ? value.map(String) : [String(value)];

    return ids
      .map((id) => {
        const option = definition.options.find(o => o.id === id || o.key === id);

        return option ? { optionId: option.id, name: option.name } : null;
      })
      .filter(v => v !== null);
  }

  return value;
}

function buildCustomPropertiesResponse({
  definitions,
  storedValues,
  documentId,
}: {
  definitions: CustomPropertyDefinition[];
  storedValues: DocumentCustomPropertyValueStorage[];
  documentId: string;
}) {
  const documentValues = storedValues.filter(v => v.documentId === documentId);
  const valuesByDefinitionId = Object.fromEntries(documentValues.map(v => [v.propertyDefinitionId, v.value]));

  return definitions
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map(def => ({
      propertyDefinitionId: def.id,
      key: def.key,
      name: def.name,
      type: def.type,
      displayOrder: def.displayOrder,
      value: hydratePropertyValue({ value: valuesByDefinitionId[def.id] ?? null, definition: def }),
    }));
}

// The demo keeps one layout per organization, completed with the defaults like the server does
function parseDemoPreferences(stored: unknown): MemberPreferences {
  const value = (stored ?? {}) as Partial<MemberPreferences>;

  return applyPreferencesPatch({ preferences: DEFAULT_MEMBER_PREFERENCES, patch: { dashboard: value.dashboard, navigation: value.navigation } });
}

// Like the server: a past year is measured as of its last instant, the current one as of now
function getMetricsInstant({ year, now = new Date() }: { year: number; now?: Date }) {
  return Number.isInteger(year) && year < now.getUTCFullYear() ? new Date(Date.UTC(year, 11, 31, 23, 59, 59)) : now;
}

// Name of the demo user, changeable from the settings until the page reloads
let demoUserName = demoUser.name;

// Step of a previewed onboarding flow, kept until the page reloads
let demoOnboardingStep: string | null = null;

const inMemoryApiMock: Record<string, { handler: any }> = {
  ...invoicingHandlers,
  ...pricingHandlers,
  ...pricingImportHandlers,
  ...dataImportsHandlers,
  ...contactsHandlers,
  ...purchasesHandlers,
  ...deliveryNotesHandlers,
  ...dueDatesHandlers,
  ...productScannerHandlers,
  ...capturesHandlers,
  ...gestoriasHandlers,

  ...defineHandler({
    path: '/api/organizations/:organizationId/taxes/:year/:quarter',
    method: 'GET',
    handler: async ({ params: { organizationId, year, quarter }, query }) => {
      const [{ invoices }, purchaseInvoices, profile] = await Promise.all([
        getDemoInvoicingRecords({ organizationId }),
        listDemoPurchaseInvoices({ organizationId }),
        getDemoFiscalProfile({ organizationId }),
      ]);
      const simulateBaseMinor = Number(get(query, ['simulateBaseMinor']));

      const report = computeDemoQuarterlyTaxReport({
        issuedInvoices: invoices as never,
        purchaseInvoices: purchaseInvoices as never,
        profile: profile as never,
        year: Number(year),
        quarter: Number(quarter) as 1 | 2 | 3 | 4,
        simulatedPurchase: Number.isFinite(simulateBaseMinor) && simulateBaseMinor > 0
          ? { baseMinor: simulateBaseMinor, taxRateBps: Number(get(query, ['simulateTaxRateBps']) ?? 2_100), deductibleRateBps: Number(get(query, ['simulateDeductibleRateBps']) ?? 10_000), category: (get(query, ['simulateCategory']) ?? 'other') as never }
          : undefined,
      });

      return { report };
    },
  }),

  // The accountant pack is generated by the server, not available in the browser only demo
  ...defineHandler({
    path: '/api/organizations/:organizationId/taxes/:year/:quarter/export',
    method: 'GET',
    handler: async () => throwDemoNotAvailable(),
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/taxes/:year/:quarter/send',
    method: 'POST',
    handler: async () => throwDemoNotAvailable(),
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/extract',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const documentId = get(body, ['documentId']) as string;
      const document = await documentStorage.getItem(`${organizationId}:${documentId}`);

      assert(document, { status: 404 });

      return { ...buildDemoExtraction({ documentId, documentName: String((document as { name?: unknown }).name ?? '') }), status: 'ready', checks: [] };
    },
  }),
  // The demo has no AI nor queue: a document is "read" at once, the same reading every time it is opened
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/readings',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => ({ readings: await getDemoReadings({ organizationId, documentIds: (get(body, ['documentIds']) as string[] | undefined) ?? [] }) }),
  }),
  // The documents read and not registered yet (uploaded and left unreviewed: the demo receives no email)
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/inbox',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const linkedDocumentIds = new Set((await listDemoPurchaseInvoices({ organizationId })).map(({ documentId }) => documentId).filter(Boolean));
      const readings = await getDemoReadings({ organizationId, documentIds: [...demoReadings.keys()].filter(documentId => !linkedDocumentIds.has(documentId)) });
      const documents = await Promise.all(readings.map(async ({ documentId }) => documentStorage.getItem(`${organizationId}:${documentId}`)));

      return { readings: readings.map((reading, index) => ({ ...reading, documentName: documents[index]?.name ?? null })) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/inbox/:documentId',
    method: 'DELETE',
    handler: async ({ params: { documentId } }) => {
      demoReadings.delete(documentId);
      return {};
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/readings',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }) => ({ readings: await getDemoReadings({ organizationId, documentIds: String(get(query, ['documentIds']) ?? '').split(',').filter(Boolean) }) }),
  }),
  ...aiHandlers,
  ...miscHandlers,

  // No feature flags in the demo: personal finances stays hidden, like for any new account
  ...defineHandler({ path: '/api/feature-flags', method: 'GET', handler: () => ({ featureFlags: [] }) }),
  ...defineHandler({ path: '/api/organizations/deleted', method: 'GET', handler: () => ({ organizations: [] }) }),
  ...defineHandler({ path: '/api/organizations/:organizationId/intake-emails', method: 'GET', handler: () => ({ intakeEmails: [], deliveries: [], domain: 'heypaqui.com' }) }),
  ...defineHandler({ path: '/api/organizations/:organizationId/tagging-rules/:taggingRuleId/apply', method: 'POST', handler: () => ({ taskId: createId({ prefix: 'task' }) }) }),

  // Things that need a real server (emails, payments, other people): explained instead of failing silently
  ...defineHandler({ path: '/api/organizations/:organizationId/intake-emails', method: 'POST', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/organizations/:organizationId/intake-emails/:intakeEmailId', method: 'PUT', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/organizations/:organizationId/intake-emails/:intakeEmailId', method: 'DELETE', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/organizations/:organizationId/checkout-session', method: 'POST', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/organizations/:organizationId/restore', method: 'POST', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/organizations/:organizationId/members/:memberId', method: 'PATCH', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/organizations/:organizationId/members/:memberId', method: 'DELETE', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/invitations/:invitationId/accept', method: 'POST', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/invitations/:invitationId/reject', method: 'POST', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/invitations/:invitationId/cancel', method: 'POST', handler: () => throwDemoNotAvailable() }),
  ...defineHandler({ path: '/api/invitations/:invitationId/resend', method: 'POST', handler: () => throwDemoNotAvailable() }),
  // The demo identity already has a password; creating its first one is not a valid demo operation.
  ...defineHandler({ path: '/api/users/me/password', method: 'POST', handler: () => throwDemoNotAvailable() }),

  ...defineHandler({
    path: '/api/config',
    method: 'GET',
    handler: () => ({
      config: {
        auth: {
          isEmailVerificationRequired: false,
          isPasswordResetEnabled: false,
          providers: {
            github: { isEnabled: false },
          },
        },
      },
    }),
  }),

  ...defineHandler({
    path: '/api/users/me',
    method: 'GET',
    handler: () => ({
      user: { ...demoUser, name: demoUserName },
    }),
  }),

  // The name can be changed for the visit; reloading brings back the demo user
  ...defineHandler({
    path: '/api/users/me',
    method: 'PUT',
    handler: ({ body }) => {
      const { name } = (body ?? {}) as { name?: string };
      demoUserName = name?.trim() || demoUser.name;
      return { user: { ...demoUser, name: demoUserName } };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      // body is a FormData instance with file field

      const file = (body as FormData).get('file') as File;

      assert(file, { status: 400 });

      const document = {
        id: createId({ prefix: 'doc' }),
        organizationId,
        name: file.name,
        originalName: file.name,
        originalSize: file.size,
        mimeType: file.type,
        content: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };

      const key = `${organizationId}:${document.id}`;

      await documentFileStorage.setItem(key, await serializeFile(file));
      await documentStorage.setItem(key, document);

      // Simulate a slow response
      await new Promise(resolve => setTimeout(resolve, 500));

      return { document };
    },
  }),

  // Files attached to the assistant: kept as documents like any upload, the same file again gives back its document
  ...defineHandler({
    path: '/api/organizations/:organizationId/ai/attachments',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const file = (body as FormData).get('file') as File;
      assert(file, { status: 400 });

      const existing = (await getValues(documentStorage)).find(document => document?.organizationId === organizationId && !document?.deletedAt && document.name === file.name && document.originalSize === file.size);
      if (existing) {
        return { document: existing, isExisting: true };
      }

      const now = new Date();
      const document = { id: createId({ prefix: 'doc' }), organizationId, name: file.name, originalName: file.name, originalSize: file.size, mimeType: file.type, content: '', createdAt: now, updatedAt: now, tags: [] };
      const key = `${organizationId}:${document.id}`;
      await documentFileStorage.setItem(key, await serializeFile(file));
      await documentStorage.setItem(key, document);

      return { document, isExisting: false };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/customer-portal',
    method: 'GET',
    handler: async () => {
      throw Object.assign(new FetchError('Not available in demo'), { status: 501 });
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/statistics',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const documents = await findMany(documentStorage, document => document.organizationId === organizationId);

      return {
        organizationStats: {
          documentsCount: documents.length,
          documentsSize: documents.reduce((acc, document) => acc + document.originalSize, 0),
        },
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }) => {
      const {
        pageIndex = 0,
        pageSize = 5,
        searchQuery: rawSearchQuery = '',
      } = query ?? {};

      const organization = await organizationStorage.getItem(organizationId);
      assert(organization, { status: 403 });

      const searchQuery = rawSearchQuery.trim();
      const [organizationDocuments, allTags, tagDocuments, allDefinitions, allPropertyValues, folders] = await Promise.all([
        findMany(documentStorage, document => document?.organizationId === organizationId && !document?.deletedAt),
        getValues(tagStorage),
        getValues(tagDocumentStorage),
        findMany(customPropertyDefinitionStorage, def => def.organizationId === organizationId && (def.entityType ?? 'document') === 'document'),
        getValues(documentCustomPropertyValueStorage),
        getValues(folderStorage),
      ]);

      const documentsWithTagsAndProperties = organizationDocuments.map((document) => {
        const documentTagDocuments = tagDocuments.filter(tagDocument => tagDocument?.documentId === document?.id);
        const tags = allTags.filter(tag => documentTagDocuments.some(tagDocument => tagDocument?.tagId === tag?.id));

        const customProperties = buildCustomPropertiesResponse({
          definitions: allDefinitions,
          storedValues: allPropertyValues,
          documentId: document.id,
        });

        return {
          ...document,
          tags,
          customProperties,
          folder: folders.find(folder => folder.id === (document as { folderId?: string | null }).folderId) ?? null,
        };
      });

      const filteredDocuments = searchDemoDocuments({ query: searchQuery, documents: documentsWithTagsAndProperties as unknown as Document[] });

      const paginatedDocuments = filteredDocuments
        .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

      return {
        documents: paginatedDocuments,
        documentsCount: filteredDocuments.length,
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/deleted',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const organization = await organizationStorage.getItem(organizationId);
      assert(organization, { status: 403 });

      const deletedDocuments = await findMany(
        documentStorage,
        document => document.organizationId === organizationId && document.deletedAt !== undefined,
      );

      return {
        documents: deletedDocuments,
        documentsCount: deletedDocuments.length,
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId',
    method: 'GET',
    handler: async ({ params: { organizationId, documentId } }) => {
      const key = `${organizationId}:${documentId}`;
      const document = await documentStorage.getItem(key);

      assert(document, { status: 404 });

      const [tagDocuments, allDefinitions, allPropertyValues] = await Promise.all([
        findMany(tagDocumentStorage, tagDocument => tagDocument.documentId === documentId),
        findMany(customPropertyDefinitionStorage, def => def.organizationId === organizationId && (def.entityType ?? 'document') === 'document'),
        findMany(documentCustomPropertyValueStorage, v => v.documentId === documentId),
      ]);

      const tags = await findMany(tagStorage, tag => tagDocuments.some(tagDocument => tagDocument.tagId === tag.id));

      const customProperties = buildCustomPropertiesResponse({
        definitions: allDefinitions,
        storedValues: allPropertyValues,
        documentId,
      });

      return {
        document: {
          ...document,
          tags,
          customProperties,
        },
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/restore',
    method: 'POST',
    handler: async ({ params: { organizationId, documentId } }) => {
      const key = `${organizationId}:${documentId}`;
      const document = await documentStorage.getItem(key);

      assert(document, { status: 404 });

      document.deletedAt = undefined;
      document.deletedBy = undefined;
      document.updatedAt = new Date();

      await documentStorage.setItem(key, document);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId',
    method: 'DELETE',
    handler: async ({ params: { organizationId, documentId } }) => {
      const key = `${organizationId}:${documentId}`;

      const document = await documentStorage.getItem(key);
      assert(document, { status: 404 });

      const now = new Date();

      document.deletedAt = now;
      document.updatedAt = now;
      document.deletedBy = 'usr_1';

      await documentStorage.setItem(key, document);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/file',
    method: 'GET',
    handler: async ({ params }) => {
      const { organizationId, documentId } = params;
      const key = `${organizationId}:${documentId}`;

      const file = await documentFileStorage.getItem(key);

      assert(file, { status: 404 });

      return deserializeFile(file);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tags',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const tags = await findMany(tagStorage, tag => tag.organizationId === organizationId);
      const tagDocuments = await getValues(tagDocumentStorage);

      const tagsWithDocumentsCount = tags.map(tag => ({
        ...tag,
        documentsCount: tagDocuments.filter(tagDocument => tagDocument.tagId === tag.id).length,
      }));

      return {
        tags: tagsWithDocumentsCount,
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tags',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const name = get(body, ['name']) as string;
      const existingTagsWithSameName = await findMany(tagStorage, tag => tag.organizationId === organizationId && tag.name.toLowerCase() === name.toLowerCase());

      if (existingTagsWithSameName.length > 0) {
        throw Object.assign(new FetchError('Tag already exists'), {
          status: 400,
          data: { error: { code: 'tags.already_exists' } },
        });
      }

      const tag = {
        id: createId({ prefix: 'tag' }),
        organizationId,
        name,
        color: get(body, ['color']) as string,
        description: (get(body, ['description']) ?? null) as string | null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await tagStorage.setItem(tag.id, tag);

      return { tag };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tags/:tagId',
    method: 'PUT',
    handler: async ({ params: { organizationId, tagId }, body }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const tag = await tagStorage.getItem(tagId);

      assert(tag, { status: 404 });

      const newName = get(body, ['name']) as string | undefined;
      if (newName) {
        const existingTagsWithSameName = await findMany(
          tagStorage,
          t =>
            t.organizationId === organizationId
            && t.id !== tagId
            && t.name.toLowerCase() === newName.toLowerCase(),
        );

        if (existingTagsWithSameName.length > 0) {
          throw Object.assign(new FetchError('Tag already exists'), {
            status: 400,
            data: { error: { code: 'tags.already_exists' } },
          });
        }
      }

      await tagStorage.setItem(tagId, Object.assign(tag, body, { updatedAt: new Date() }));

      return { tag };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tags/:tagId',
    method: 'DELETE',
    handler: async ({ params: { organizationId, tagId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      await tagStorage.removeItem(tagId);

      const tagDocuments = await findMany(tagDocumentStorage, tagDocument => tagDocument.tagId === tagId);

      await Promise.all(tagDocuments.map(tagDocument => tagDocumentStorage.removeItem(tagDocument.id)));
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/tags',
    method: 'POST',
    handler: async ({ params: { organizationId, documentId }, body }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const tagId = get(body, ['tagId']) as string;

      assert(tagId, { status: 400 });

      const tagDocument = {
        id: createId({ prefix: 'tagDoc' }),
        tagId,
        documentId,
        createdAt: new Date(),
      };

      await tagDocumentStorage.setItem(tagDocument.id, tagDocument);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/tags/:tagId',
    method: 'DELETE',
    handler: async ({ params: { organizationId, documentId, tagId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const tagDocuments = await findMany(tagDocumentStorage, tagDocument => tagDocument.tagId === tagId && tagDocument.documentId === documentId);

      await Promise.all(tagDocuments.map(tagDocument => tagDocumentStorage.removeItem(tagDocument.id)));
    },
  }),

  ...defineHandler({
    path: '/api/organizations',
    method: 'GET',
    handler: async () => {
      const organizations = await getValues(organizationStorage);

      return { organizations };
    },
  }),

  ...defineHandler({
    path: '/api/organizations',
    method: 'POST',
    handler: async ({ body }) => {
      const organization = {
        id: createId({ prefix: 'org' }),
        name: get(body, ['name']) as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await organizationStorage.setItem(organization.id, organization);

      return { organization };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      return { organization };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId',
    method: 'DELETE',
    handler: async ({ params: { organizationId } }) => {
      await organizationStorage.removeItem(organizationId);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId',
    method: 'PUT',
    handler: async ({ params: { organizationId }, body }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      organization.name = get(body, ['name']) as string;
      organization.updatedAt = new Date();

      await organizationStorage.setItem(organizationId, organization);

      return { organization };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tagging-rules',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const taggingRules = await findMany(taggingRuleStorage, taggingRule => taggingRule.organizationId === organizationId);

      return { taggingRules };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tagging-rules',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const taggingRule = {
        id: createId({ prefix: 'tr' }),
        organizationId,
        name: get(body, ['name']) as string,
        description: (get(body, ['description']) ?? '') as string,
        conditions: get(body, ['conditions']) as any,
        actions: (get(body, ['tagIds']) as string[]).map((tagId: string) => ({ tagId })),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await taggingRuleStorage.setItem(taggingRule.id, taggingRule);

      return { taggingRule };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tagging-rules/:taggingRuleId',
    method: 'GET',
    handler: async ({ params: { taggingRuleId } }) => {
      const taggingRule = await taggingRuleStorage.getItem(taggingRuleId);

      assert(taggingRule, { status: 404 });

      return { taggingRule };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tagging-rules/:taggingRuleId',
    method: 'DELETE',
    handler: async ({ params: { taggingRuleId } }) => {
      await taggingRuleStorage.removeItem(taggingRuleId);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/tagging-rules/:taggingRuleId',
    method: 'PUT',
    handler: async ({ params: { taggingRuleId }, body }) => {
      const taggingRule = await taggingRuleStorage.getItem(taggingRuleId);

      assert(taggingRule, { status: 404 });

      await taggingRuleStorage.setItem(taggingRuleId, Object.assign(taggingRule, body, { updatedAt: new Date() }));

      return { taggingRule };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/trash',
    method: 'DELETE',
    handler: async ({ params: { organizationId } }) => {
      const documents = await findMany(documentStorage, document => document.organizationId === organizationId && Boolean(document.deletedAt));

      await Promise.all(documents.map(document => documentStorage.removeItem(`${organizationId}:${document.id}`)));
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/trash/:documentId',
    method: 'DELETE',
    handler: async ({ params: { organizationId, documentId } }) => {
      const key = `${organizationId}:${documentId}`;

      await documentStorage.removeItem(key);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/members',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      return {
        members: [{
          id: 'mem_1',
          user: demoUser,
          role: 'owner',
          organizationId,
        }],
      };
    },
  }),

  // Inviting needs emails: the demo organization has no pending invitations
  ...defineHandler({
    path: '/api/organizations/:organizationId/members/invitations',
    method: 'GET',
    handler: () => ({ invitations: [] }),
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/members/invitations',
    method: 'POST',
    handler: async () => {
      throw Object.assign(new FetchError('Not available in demo'), {
        status: 501,
        data: {
          error: {
            message: 'This feature is not available in demo',
            code: 'demo.not_available',
          },
        },
      });
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/members/me',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      return {
        member: {
          id: 'mem_1',
          role: 'owner',
          organizationId,
        },
      };
    },
  }),

  ...defineHandler({
    path: '/api/api-keys',
    method: 'GET',
    handler: async () => {
      const apiKeys = await getValues(apiKeyStorage);

      return { apiKeys };
    },
  }),

  ...defineHandler({
    path: '/api/api-keys',
    method: 'POST',
    handler: async ({ body }) => {
      const token = `ppapi_${randomString({ length: 64 })}`;

      const apiKey = {
        id: createId({ prefix: 'apiKey' }),
        name: get(body, ['name']),
        permissions: get(body, ['permissions']),
        organizationIds: get(body, ['organizationIds']),
        allOrganizations: get(body, ['allOrganizations']),
        expiresAt: get(body, ['expiresAt']),
        createdAt: new Date(),
        updatedAt: new Date(),
        prefix: token.slice(0, 11),
      } as ApiKey;

      await apiKeyStorage.setItem(apiKey.id, apiKey);

      return { apiKey, token };
    },
  }),

  ...defineHandler({
    path: '/api/api-keys/:apiKeyId',
    method: 'DELETE',
    handler: async ({ params: { apiKeyId } }) => {
      await apiKeyStorage.removeItem(apiKeyId);
    },
  }),

  // The demo account is already set up; the onboarding can still be previewed with `/onboarding?flow=new-user` in development
  ...defineHandler({
    path: '/api/onboarding',
    method: 'GET',
    handler: async () => {
      const [organization] = await getValues(organizationStorage);
      // A forced step reopens the setup of the demo company
      const pendingOrganizations = demoOnboardingStep && organization ? [{ id: organization.id, name: organization.name, step: demoOnboardingStep }] : [];

      return { flow: null, user: { completedAt: new Date().toISOString(), step: demoOnboardingStep }, pendingOrganizations, pendingInvitationsCount: 0 };
    },
  }),

  ...defineHandler({
    path: '/api/onboarding',
    method: 'PUT',
    handler: async ({ body }) => {
      // Lets the dev tools resume a previewed flow at a given step
      demoOnboardingStep = get(body, ['completed']) ? null : (get(body, ['step']) as string | null) ?? null;
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/onboarding',
    method: 'PUT',
    handler: async () => {},
  }),

  ...defineHandler({
    path: '/api/invitations/count',
    method: 'GET',
    handler: async () => ({ pendingInvitationsCount: 0 }),
  }),

  ...defineHandler({
    path: '/api/invitations',
    method: 'GET',
    handler: async () => ({ invitations: [] }),
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/webhooks',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const webhooks = await findMany(webhooksStorage, webhook => webhook.organizationId === organizationId);

      return { webhooks };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/webhooks',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const webhook: Webhook = {
        id: createId({ prefix: 'webhook' }),
        organizationId,
        name: get(body, ['name']) as string,
        url: get(body, ['url']) as string,
        enabled: true,
        events: get(body, ['events']) as Webhook['events'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await webhooksStorage.setItem(webhook.id, webhook);

      return { webhook };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/webhooks/:webhookId',
    method: 'GET',
    handler: async ({ params: { webhookId } }) => {
      const webhook = await webhooksStorage.getItem(webhookId);
      return { webhook };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/webhooks/:webhookId',
    method: 'DELETE',
    handler: async ({ params: { webhookId } }) => {
      await webhooksStorage.removeItem(webhookId);
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/webhooks/:webhookId',
    method: 'PUT',
    handler: async ({ params: { webhookId }, body }) => {
      const webhook = await webhooksStorage.getItem(webhookId);

      assert(webhook, { status: 404 });

      await webhooksStorage.setItem(webhookId, Object.assign(webhook, body, { updatedAt: new Date() }));

      return { webhook };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId',
    method: 'PATCH',
    handler: async ({ params: { organizationId, documentId }, body }) => {
      const document = await documentStorage.getItem(`${organizationId}:${documentId}`);

      assert(document, { status: 404 });

      const { name, content, documentDate } = body as { name?: string; content?: string; documentDate?: string };

      const newDocument = {
        ...document,
        ...(name !== undefined && { name }),
        ...(content !== undefined && { content }),
        ...(documentDate !== undefined && { documentDate: documentDate === null ? null : new Date(documentDate) }),
        updatedAt: new Date(),
      };

      await documentStorage.setItem(`${organizationId}:${documentId}`, newDocument as Document); // TODO: introduce a storage/serialized type

      return { document: newDocument };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/activity',
    method: 'GET',
    handler: async ({ params: { organizationId, documentId }, query }) => {
      const key = `${organizationId}:${documentId}`;
      const document = await documentStorage.getItem(key);

      assert(document, { status: 404 });

      const {
        pageIndex = 0,
      } = query ?? {};

      // Return mock activity for demo - just a created event
      const activities = pageIndex === 0
        ? [{
            id: 'activity_1',
            documentId,
            event: 'created',
            eventData: {},
            createdAt: document.createdAt,
            user: {
              id: 'usr_1',
              name: demoUser.name,
            },
          }]
        : [];

      return { activities };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/subscription',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      // Demo mode uses free plan with no subscription
      return {
        subscription: null,
        plan: {
          id: 'free',
          name: 'Free',
          limits: {
            maxDocumentStorageBytes: 1024 * 1024 * 500, // 500 MiB
            maxIntakeEmailsCount: 1,
            maxOrganizationsMembersCount: 3,
            maxFileSize: 1024 * 1024 * 50, // 50 MiB
          },
        },
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/usage',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const documents = await findMany(documentStorage, document => document.organizationId === organizationId);

      const totalDocumentsSize = documents.reduce((acc, doc) => acc + (doc.originalSize ?? 0), 0);
      const deletedDocumentsSize = documents
        .filter(doc => doc.deletedAt)
        .reduce((acc, doc) => acc + (doc.originalSize ?? 0), 0);

      return {
        usage: {
          documentsStorage: {
            used: totalDocumentsSize,
            deleted: deletedDocumentsSize,
            limit: 1024 * 1024 * 500, // 500 MiB
          },
          intakeEmailsCount: {
            used: 0,
            limit: 1,
          },
          membersCount: {
            used: 1,
            limit: 3,
          },
        },
        limits: {
          maxDocumentStorageBytes: 1024 * 1024 * 500, // 500 MiB
          maxIntakeEmailsCount: 1,
          maxOrganizationsMembersCount: 3,
          maxFileSize: 1024 * 1024 * 50, // 50 MiB
        },
      };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/dashboard/metrics',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const [{ invoices, customers, currency }, documents, purchaseInvoices, contacts] = await Promise.all([
        getDemoInvoicingRecords({ organizationId }),
        findMany(documentStorage, document => document?.organizationId === organizationId && !document?.deletedAt),
        listDemoPurchaseInvoices({ organizationId }),
        listDemoContacts({ organizationId }),
      ]);

      return { metrics: computeDemoDashboardMetrics({ invoices: invoices as never, customers, documents, currency, purchaseInvoices: purchaseInvoices as never, contacts: contacts as never, now: getMetricsInstant({ year: Number(get(query, ['year'])) }) }) };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/preferences',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => ({ preferences: parseDemoPreferences(await memberPreferencesStorage.getItem(organizationId)) }),
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/preferences',
    method: 'PATCH',
    handler: async ({ params: { organizationId }, body }) => {
      const preferences = applyPreferencesPatch({ preferences: parseDemoPreferences(await memberPreferencesStorage.getItem(organizationId)), patch: body as MemberPreferencesPatch });
      await memberPreferencesStorage.setItem(organizationId, preferences);

      return { preferences };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/custom-properties',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const entityType = get(query, ['entityType']) as string | undefined;
      const propertyDefinitions = await findMany(customPropertyDefinitionStorage, def => def.organizationId === organizationId && (!entityType || (def.entityType ?? 'document') === entityType));

      return { propertyDefinitions };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/custom-properties/entities/:entityType/:entityId',
    method: 'GET',
    handler: async ({ params: { organizationId, entityType, entityId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      return { customProperties: await formatDemoEntityCustomProperties({ organizationId, entityTypes: [entityType], entityId }) };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/contacts/:contactId',
    method: 'GET',
    handler: async ({ params: { organizationId, contactId } }) => {
      const contact = await getDemoContact({ organizationId, contactId });

      assert(contact, { status: 404 });

      const entityTypes = (['customer', 'supplier', 'sales_representative'] as const).filter(role => contact[({ customer: 'isCustomer', supplier: 'isSupplier', sales_representative: 'isSalesRepresentative' } as const)[role]]);

      return { contact, customProperties: await formatDemoEntityCustomProperties({ organizationId, entityTypes, entityId: contactId }) };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/custom-properties',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const existingDefinitions = await findMany(customPropertyDefinitionStorage, def => def.organizationId === organizationId);

      const propertyDefinition = {
        id: createId({ prefix: 'cpd' }),
        organizationId,
        name: get(body, ['name']) as string,
        key: generatePropertyKey({ name: get(body, ['name']) as string }),
        description: (get(body, ['description']) ?? null) as string | null,
        type: get(body, ['type']) as string,
        entityType: (get(body, ['entityType']) ?? 'document') as string,
        displayOrder: existingDefinitions.length,
        options: (get(body, ['options']) as { name: string }[] ?? []).map((option, index) => ({
          id: createId({ prefix: 'opt' }),
          name: option.name,
          key: generatePropertyKey({ name: option.name }),
          displayOrder: index,
        })),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await customPropertyDefinitionStorage.setItem(propertyDefinition.id, propertyDefinition as any);

      return { propertyDefinition };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/custom-properties/:propertyDefinitionId',
    method: 'GET',
    handler: async ({ params: { organizationId, propertyDefinitionId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const definition = await customPropertyDefinitionStorage.getItem(propertyDefinitionId);

      assert(definition, { status: 404 });

      return { definition };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/custom-properties/:propertyDefinitionId',
    method: 'PUT',
    handler: async ({ params: { organizationId, propertyDefinitionId }, body }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      const propertyDefinition = await customPropertyDefinitionStorage.getItem(propertyDefinitionId);

      assert(propertyDefinition, { status: 404 });

      const updatedDefinition = Object.assign(propertyDefinition, body, { updatedAt: new Date() });

      await customPropertyDefinitionStorage.setItem(propertyDefinitionId, updatedDefinition);

      return { propertyDefinition: updatedDefinition };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/custom-properties/:propertyDefinitionId',
    method: 'DELETE',
    handler: async ({ params: { organizationId, propertyDefinitionId } }) => {
      const organization = await organizationStorage.getItem(organizationId);

      assert(organization, { status: 403 });

      await customPropertyDefinitionStorage.removeItem(propertyDefinitionId);

      // Remove all values associated with this definition
      const values = await findMany(documentCustomPropertyValueStorage, v => v.propertyDefinitionId === propertyDefinitionId);

      await Promise.all(values.map(v => documentCustomPropertyValueStorage.removeItem(`${v.documentId}:${propertyDefinitionId}`)));
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/custom-properties',
    method: 'GET',
    handler: async ({ params: { organizationId, documentId } }) => {
      const key = `${organizationId}:${documentId}`;
      const document = await documentStorage.getItem(key);

      assert(document, { status: 404 });

      const [allDefinitions, allValues] = await Promise.all([
        findMany(customPropertyDefinitionStorage, def => def.organizationId === organizationId && (def.entityType ?? 'document') === 'document'),
        findMany(documentCustomPropertyValueStorage, v => v.documentId === documentId),
      ]);

      const customProperties = buildCustomPropertiesResponse({
        definitions: allDefinitions,
        storedValues: allValues,
        documentId,
      });

      return { customProperties };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/custom-properties/:propertyDefinitionId',
    method: 'PUT',
    handler: async ({ params: { organizationId, documentId, propertyDefinitionId }, body }) => {
      const docKey = `${organizationId}:${documentId}`;
      const document = await documentStorage.getItem(docKey);

      assert(document, { status: 404 });

      const definition = await customPropertyDefinitionStorage.getItem(propertyDefinitionId);

      assert(definition, { status: 404 });

      const valueKey = `${documentId}:${propertyDefinitionId}`;
      const existing = await documentCustomPropertyValueStorage.getItem(valueKey);

      const value = get(body, ['value']);

      await documentCustomPropertyValueStorage.setItem(valueKey, {
        id: existing?.id ?? createId({ prefix: 'dcpv' }),
        documentId,
        propertyDefinitionId,
        value,
      });
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/custom-properties/:propertyDefinitionId',
    method: 'DELETE',
    handler: async ({ params: { organizationId, documentId, propertyDefinitionId } }) => {
      const docKey = `${organizationId}:${documentId}`;
      const document = await documentStorage.getItem(docKey);

      assert(document, { status: 404 });

      const valueKey = `${documentId}:${propertyDefinitionId}`;

      await documentCustomPropertyValueStorage.removeItem(valueKey);
    },
  }),
};

export const router = createRouter({ routes: inMemoryApiMock, strictTrailingSlash: false });
