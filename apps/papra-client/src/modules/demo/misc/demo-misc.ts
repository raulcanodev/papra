import type { CalendarFeed, PublicCalendarEvent } from '../../calendar/calendar.types';
import { prefixStorage } from 'unstorage';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { storage } from '../demo.storage';
import { getValues } from '../demo.storage.models';

type StoredFolder = { id: string; organizationId: string; parentFolderId: string | null; contactId: null; name: string; kind: 'manual'; documentsCount: number; createdAt: string; updatedAt: string };

const folderStorage = prefixStorage<StoredFolder>(storage, 'documentFolders');

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
    handler: async ({ params: { organizationId } }) => ({ folders: (await getValues(folderStorage)).filter(folder => folder.organizationId === organizationId) }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/document-folders',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const { name, parentFolderId } = (body ?? {}) as { name?: string; parentFolderId?: string | null };
      const now = new Date().toISOString();
      const folder: StoredFolder = { id: createId({ prefix: 'fld' }), organizationId, parentFolderId: parentFolderId ?? null, contactId: null, name: name ?? 'Folder', kind: 'manual', documentsCount: 0, createdAt: now, updatedAt: now };
      await folderStorage.setItem(folder.id, folder);
      return { folder };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/document-folders/:folderId/documents',
    method: 'GET',
    handler: async ({ params: { folderId } }) => ({ folder: await folderStorage.getItem(folderId), documents: [], documentsCount: 0 }),
  }),
};
