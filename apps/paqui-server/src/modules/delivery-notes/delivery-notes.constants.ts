export const DELIVERY_NOTE_ID_PREFIX = 'dln';
export const DELIVERY_NOTE_ITEM_ID_PREFIX = 'dlni';

// A delivery note is pending until it goes on an invoice; deleting that draft invoice makes it pending again
export const DELIVERY_NOTE_STATUSES = ['pending', 'invoiced'] as const;
export type DeliveryNoteStatus = typeof DELIVERY_NOTE_STATUSES[number];

// The products the reader may pick from: the most used first when the catalog is bigger
export const MAX_READING_CATALOG_PRODUCTS = 400;
// What the reader learnt from past reviews ("tom. pera" is that product), the most recent first
export const MAX_READING_ALIASES = 300;
export const MAX_LINE_ALTERNATIVES = 3;

export const MAX_INVOICED_DELIVERY_NOTES = 100;
