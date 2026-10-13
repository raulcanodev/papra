export type PublicCalendarEvent = {
  id: string;
  date: string;
  name: string;
  type: 'holiday' | 'tax-deadline';
  source: string;
};

export type CalendarFeed = {
  events: PublicCalendarEvent[];
  warnings: string[];
  holidayRegion: string | null;
  holidaySubdivision: string | null;
  updatedAt: string;
};
