import Holidays from 'date-holidays';

export type PublicCalendarEvent = {
  id: string;
  date: string;
  name: string;
  type: 'holiday' | 'tax-deadline';
  source: string;
};

const AEAT_CALENDARS = [
  {
    id: 'aeat-iva',
    name: 'AEAT · IVA',
    url: 'https://www.google.com/calendar/ical/517mcuhcis0lldnp9b7c0nk2q8%40group.calendar.google.com/public/basic.ics',
  },
  {
    id: 'aeat-income-corporate',
    name: 'AEAT · Renta y Sociedades',
    url: 'https://www.google.com/calendar/ical/aio2b0s64q65r7v87j5ma8fvog%40group.calendar.google.com/public/basic.ics',
  },
  {
    id: 'aeat-information-returns',
    name: 'AEAT · Declaraciones informativas',
    url: 'https://www.google.com/calendar/ical/hqp9h5ft4snag42aea96791g28%40group.calendar.google.com/public/basic.ics',
  },
] as const;

const REGION_CODES: Record<string, string> = {
  an: 'AN',
  andalucia: 'AN',
  ar: 'AR',
  aragon: 'AR',
  as: 'AS',
  asturias: 'AS',
  cb: 'CB',
  cantabria: 'CB',
  ce: 'CE',
  ceuta: 'CE',
  cl: 'CL',
  castillayleon: 'CL',
  cm: 'CM',
  castillalamancha: 'CM',
  cn: 'CN',
  canarias: 'CN',
  islascanarias: 'CN',
  ct: 'CT',
  cataluna: 'CT',
  catalunya: 'CT',
  ex: 'EX',
  extremadura: 'EX',
  ga: 'GA',
  galicia: 'GA',
  ib: 'IB',
  illesbalears: 'IB',
  islasbaleares: 'IB',
  baleares: 'IB',
  mc: 'MC',
  murcia: 'MC',
  regiondemurcia: 'MC',
  md: 'MD',
  madrid: 'MD',
  comunidaddemadrid: 'MD',
  ml: 'ML',
  melilla: 'ML',
  nc: 'NC',
  navarra: 'NC',
  comunidadforaldenavarra: 'NC',
  pv: 'PV',
  paisvasco: 'PV',
  euskadi: 'PV',
  ri: 'RI',
  larioja: 'RI',
  vc: 'VC',
  valencia: 'VC',
  comunitatvalenciana: 'VC',
  comunidadvalenciana: 'VC',
};

const calendarCache = new Map<string, { expiresAt: number; value: string }>();
const CACHE_DURATION_MS = 6 * 60 * 60 * 1_000;

function normalizeRegion(value: string | null | undefined) {
  if (value === null || value === undefined || value.length === 0) {
    return undefined;
  }
  const key = value.normalize('NFD').replace(/[\u0300-\u036F]/g, '').replace(/[^a-z]/gi, '').toLowerCase();
  return REGION_CODES[key];
}

function eventId(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

export function generateSpanishHolidays({ year, region, locale }: { year: number; region?: string | null; locale: string }) {
  const subdivision = normalizeRegion(region);
  const language = locale.toLowerCase().startsWith('es') ? 'es' : 'en';
  const engine = subdivision !== undefined
    ? new Holidays('ES', subdivision, { languages: [language, 'es', 'en'], types: ['public'] })
    : new Holidays('ES', { languages: [language, 'es', 'en'], types: ['public'] });

  const events = engine.getHolidays(year, language)
    .filter(holiday => holiday.type === 'public')
    .map((holiday): PublicCalendarEvent => ({
      id: `holiday-${holiday.date.slice(0, 10)}-${eventId(holiday.name)}`,
      date: holiday.date.slice(0, 10),
      name: holiday.name,
      type: 'holiday',
      source: subdivision !== undefined ? `Festivos · ${region ?? subdivision}` : 'Festivos · España',
    }));

  return { events, subdivision: subdivision ?? null };
}

function unfoldIcs(value: string) {
  return value.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function unescapeIcsText(value: string) {
  return value.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function readIcsDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function eventName(summary: string, description: string) {
  const models = [...description.matchAll(/(?:^|\D)(\d{3})(?!\d)/g)]
    .map(match => match[1])
    .filter((model): model is string => model !== undefined)
    .filter((model, index, values) => values.indexOf(model) === index)
    .slice(0, 6);
  return models.length > 0 ? `${summary} · ${models.join(', ')}` : summary;
}

export function parseAeatCalendar({ body, year, sourceId, sourceName }: { body: string; year: number; sourceId: string; sourceName: string }) {
  const events: PublicCalendarEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of unfoldIcs(body)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current !== null) {
        const date = readIcsDate(current.DTSTART ?? '');
        const summary = unescapeIcsText(current.SUMMARY ?? '');
        const description = unescapeIcsText(current.DESCRIPTION ?? '');
        if (date !== null && date.startsWith(`${year}-`) && summary.length > 0) {
          const identity = current.UID ?? `${date}-${summary}`;
          events.push({ id: `${sourceId}-${eventId(identity)}`, date, name: eventName(summary, description), type: 'tax-deadline', source: sourceName });
        }
      }
      current = null;
      continue;
    }
    if (current === null) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator < 0) {
      continue;
    }
    const key = line.slice(0, separator).split(';')[0];
    if (key !== undefined && key.length > 0) {
      current[key] = line.slice(separator + 1);
    }
  }

  return events;
}

async function fetchCached(url: string) {
  const cached = calendarCache.get(url);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const response = await fetch(url, { headers: { accept: 'text/calendar' }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new Error(`Calendar source returned ${response.status}`);
  }
  const value = await response.text();
  calendarCache.set(url, { expiresAt: Date.now() + CACHE_DURATION_MS, value });
  return value;
}

export async function fetchAeatEvents(year: number) {
  const results = await Promise.allSettled(AEAT_CALENDARS.map(async source => parseAeatCalendar({
    body: await fetchCached(source.url),
    year,
    sourceId: source.id,
    sourceName: source.name,
  })));
  const warnings: string[] = [];
  const events = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    warnings.push(`No se pudo actualizar ${AEAT_CALENDARS[index]?.name ?? 'un calendario de la AEAT'}.`);
    return [];
  });
  return { events, warnings };
}
