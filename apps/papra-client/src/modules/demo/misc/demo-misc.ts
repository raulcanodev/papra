import type { CalendarFeed, PublicCalendarEvent } from '../../calendar/calendar.types';
import type { DemoStoredFolder } from '../demo.storage';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { documentStorage, folderStorage } from '../demo.storage';
import { findMany, getValues } from '../demo.storage.models';

async function listFolderDocuments({ organizationId }: { organizationId: string }) {
  return findMany(documentStorage, document => document?.organizationId === organizationId && !document?.deletedAt);
}

// Counts computed from the documents, so moving or deleting a document is reflected right away
async function listFoldersWithCounts({ organizationId }: { organizationId: string }) {
  const [folders, documents] = await Promise.all([getValues(folderStorage), listFolderDocuments({ organizationId })]);

  return folders
    .filter(folder => folder.organizationId === organizationId)
    .map(folder => ({ ...folder, documentsCount: documents.filter(document => (document as { folderId?: string | null }).folderId === folder.id).length }))
    .toSorted((left, right) => (left.kind === right.kind ? left.name.localeCompare(right.name, 'es') : left.kind === 'manual' ? -1 : 1));
}

// Fixed Spanish public holidays and quarterly tax deadlines: enough to make the calendar look alive without any API.
const HOLIDAYS: Array<[string, { es: string; en: string }]> = [
  ['01-01', { es: 'Año Nuevo', en: 'New Year\'s Day' }],
  ['01-06', { es: 'Epifanía del Señor', en: 'Epiphany' }],
  ['05-01', { es: 'Fiesta del Trabajo', en: 'Labour Day' }],
  ['08-15', { es: 'Asunción de la Virgen', en: 'Assumption Day' }],
  ['10-12', { es: 'Fiesta Nacional de España', en: 'National Day of Spain' }],
  ['11-01', { es: 'Todos los Santos', en: 'All Saints\' Day' }],
  ['12-06', { es: 'Día de la Constitución', en: 'Constitution Day' }],
  ['12-08', { es: 'Inmaculada Concepción', en: 'Immaculate Conception' }],
  ['12-25', { es: 'Navidad', en: 'Christmas Day' }],
];

const TAX_DEADLINES: Array<[string, { es: string; en: string }]> = [
  ['01-20', { es: 'Modelo 303 y 130 · 4T', en: 'Forms 303 and 130 · Q4' }],
  ['04-20', { es: 'Modelo 303 y 130 · 1T', en: 'Forms 303 and 130 · Q1' }],
  ['07-20', { es: 'Modelo 303 y 130 · 2T', en: 'Forms 303 and 130 · Q2' }],
  ['10-20', { es: 'Modelo 303 y 130 · 3T', en: 'Forms 303 and 130 · Q3' }],
];

function buildCalendar({ year, locale }: { year: number; locale: string }): CalendarFeed {
  const lang = locale.startsWith('es') ? 'es' : 'en';
  const toEvent = (type: PublicCalendarEvent['type'], source: string) => ([date, names]: [string, { es: string; en: string }]): PublicCalendarEvent => ({
    id: `${type}-${year}-${date}`,
    date: `${year}-${date}`,
    name: names[lang],
    type,
    source,
  });

  return {
    events: [...HOLIDAYS.map(toEvent('holiday', 'demo')), ...TAX_DEADLINES.map(toEvent('tax-deadline', 'demo'))].sort((a, b) => a.date.localeCompare(b.date)),
    warnings: [],
    holidayRegion: 'ES',
    holidaySubdivision: null,
    updatedAt: new Date().toISOString(),
  };
}

export const miscHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/calendar',
    method: 'GET',
    handler: ({ query }) => {
      const { year, locale } = (query ?? {}) as { year?: string; locale?: string };
      return buildCalendar({ year: Number(year) || new Date().getFullYear(), locale: locale ?? 'en' });
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/document-folders',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => ({ folders: await listFoldersWithCounts({ organizationId }) }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/document-folders',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const { name, parentFolderId } = (body ?? {}) as { name?: string; parentFolderId?: string | null };
      const now = new Date().toISOString();
      const folder: DemoStoredFolder = { id: createId({ prefix: 'fld' }), organizationId, parentFolderId: parentFolderId ?? null, contactId: null, name: name ?? 'Folder', kind: 'manual', documentsCount: 0, createdAt: now, updatedAt: now };
      await folderStorage.setItem(folder.id, folder);
      return { folder };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/document-folders/:folderId/documents',
    method: 'GET',
    handler: async ({ params: { organizationId, folderId }, query }) => {
      const { pageIndex = 0, pageSize = 25 } = (query ?? {}) as { pageIndex?: number; pageSize?: number };
      const folder = (await listFoldersWithCounts({ organizationId })).find(candidate => candidate.id === folderId) ?? null;
      const documents = (await listFolderDocuments({ organizationId }))
        .filter(document => (document as { folderId?: string | null }).folderId === folderId)
        .toSorted((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

      return {
        folder,
        documents: documents.slice(Number(pageIndex) * Number(pageSize), (Number(pageIndex) + 1) * Number(pageSize)).map(document => ({ ...document, folder })),
        documentsCount: documents.length,
      };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/documents/:documentId/folder',
    method: 'PATCH',
    handler: async ({ params: { organizationId, documentId }, body }) => {
      const key = `${organizationId}:${documentId}`;
      const document = await documentStorage.getItem(key);
      const { folderId = null } = (body ?? {}) as { folderId?: string | null };

      if (document) {
        await documentStorage.setItem(key, { ...document, folderId } as typeof document);
      }

      return {};
    },
  }),
};
