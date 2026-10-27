import { describe, expect, test } from 'vitest';
import { generateSpanishHolidays, parseAeatCalendar } from './calendar.sources';

describe('public calendar sources', () => {
  test('generates national and regional Spanish public holidays', () => {
    const national = generateSpanishHolidays({ year: 2026, locale: 'es-ES' });
    const madrid = generateSpanishHolidays({ year: 2026, region: 'Comunidad de Madrid', locale: 'es-ES' });

    expect(national.events.some(event => event.date === '2026-01-01' && event.type === 'holiday')).toBe(true);
    expect(madrid.subdivision).toBe('MD');
    expect(madrid.events.some(event => event.date === '2026-05-02')).toBe(true);
  });

  test('parses all-day AEAT events and folded summaries', () => {
    const events = parseAeatCalendar({
      body: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:deadline-1\r\nDTSTART;VALUE=DATE:20260420\r\nSUMMARY:IVA\r\n  trimestral\r\nDESCRIPTION:Autoliquidación: 303\\nOperaciones intracomunitarias: 349\r\nEND:VEVENT\r\nEND:VCALENDAR',
      year: 2026,
      sourceId: 'aeat-iva',
      sourceName: 'AEAT · IVA',
    });

    expect(events).toEqual([expect.objectContaining({ date: '2026-04-20', name: 'IVA trimestral · 303, 349', type: 'tax-deadline' })]);
  });

  test('reads each return filed that day from the HTML description and links the official pages of its models', () => {
    const events = parseAeatCalendar({
      body: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:deadline-2\r\nDTSTART;VALUE=DATE:20260531\r\nSUMMARY:IVA\r\nDESCRIPTION:<h4><ul><li><span>Abril 202\r\n 6. Ventanilla única - Régimen de importación: 36</span><span>9</span></li><li>Autoliquidación&nbsp\;mensual: 303</li></ul></h4>\r\nEND:VEVENT\r\nEND:VCALENDAR',
      year: 2026,
      sourceId: 'aeat-iva',
      sourceName: 'AEAT · IVA',
    });

    expect(events[0]).toMatchObject({
      name: 'IVA · 369, 303',
      details: ['Abril 2026. Ventanilla única - Régimen de importación: 369', 'Autoliquidación mensual: 303'],
      links: [
        { label: 'Modelo 369', url: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G420.shtml' },
        { label: 'Modelo 303', url: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G414.shtml' },
        { label: 'Calendario del contribuyente', url: 'https://sede.agenciatributaria.gob.es/Sede/calendario-contribuyente.html' },
      ],
    });
  });
});
