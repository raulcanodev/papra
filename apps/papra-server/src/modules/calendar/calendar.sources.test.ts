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
});
