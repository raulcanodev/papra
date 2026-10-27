export type PublicCalendarEvent = {
  id: string;
  date: string;
  name: string;
  type: 'holiday' | 'tax-deadline';
  source: string;
  /** What is filed that day, one line each, as the AEAT writes it */
  details?: string[];
  /** The official pages of the models filed that day */
  links?: CalendarLink[];
};

export type CalendarLink = { label: string; url: string };

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

/** Something shown on a day of the calendar, from the feed or from the invoices of the organization */
export type CalendarEntry = {
  id: string;
  date: Date;
  type: 'invoice-created' | 'invoice-issued' | 'purchase-received' | 'holiday' | 'tax-deadline' | 'payment-due' | 'collection-due';
  title: string;
  subtitle?: string;
  amount?: string;
  source?: string;
  details?: string[];
  links?: CalendarLink[];
  /** The page the entry opens (the invoice) */
  href?: string;
  isSettled?: boolean;
};
