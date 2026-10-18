export type PublicCalendarEvent = {
  id: string;
  date: string;
  name: string;
  type: 'holiday' | 'tax-deadline';
  source: string;
};

/** A due date of the organization: a received invoice to pay or an issued one to collect, opening its invoice */
export type DueDateCalendarEvent = {
  id: string;
  date: string;
  name: string;
  type: 'payment-due' | 'collection-due';
  source: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'paid' | 'returned';
  link: { entityType: 'purchase_invoice' | 'invoice'; entityId: string; documentId: string | null };
};

export type CalendarFeedEvent = PublicCalendarEvent | DueDateCalendarEvent;

export type CalendarFeed = {
  events: CalendarFeedEvent[];
  warnings: string[];
  holidayRegion: string | null;
  holidaySubdivision: string | null;
  updatedAt: string;
};
