import type { InvoiceStatus } from '../invoicing/invoicing.types';
import type { EntityIconColor } from '../ui/components/entity-icon.constants';

// What was delivered and how much, no prices: they come from the customer price list when invoiced.
// Pending until it goes on an invoice; deleting that draft invoice makes it pending again
export type DeliveryNoteStatus = 'pending' | 'invoiced';

export type DeliveryNoteItemInput = {
  productId: string | null;
  /** What was handwritten on the paper: the next readings learn the product it stands for */
  writtenText: string | null;
  description: string;
  quantityMillis: number;
};

export type DeliveryNoteDraftInput = {
  customerId: string;
  /** Read on the pad of a photo; null takes the next number */
  number: string | null;
  date: Date;
  notes: string | null;
  documentId: string | null;
  items: DeliveryNoteItemInput[];
};

export type DeliveryNote = {
  id: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  customerIcon: string | null;
  customerIconColor: EntityIconColor | null;
  number: string | null;
  date: Date;
  notes: string | null;
  documentId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus | null;
  status: DeliveryNoteStatus;
  itemCount?: number;
  items?: Array<DeliveryNoteItemInput & { id: string; position: number }>;
  createdAt: Date;
  updatedAt: Date;
};

export type DeliveryNoteReadingLine = {
  writtenText: string;
  quantityMillis: number;
  productId: string | null;
  /** memory: a text the user confirmed in a past delivery note; reading: the AI guess */
  matchedBy: 'memory' | 'reading' | null;
  confidence: 'high' | 'medium' | 'low';
  alternativeProductIds: string[];
};

export type DeliveryNoteReading = {
  documentId: string;
  number: string | null;
  date: string | null;
  warnings: string[];
  lines: DeliveryNoteReadingLine[];
  customer: { name: string | null; taxId: string | null; contactId: string | null; candidates: Array<{ contactId: string; name: string }> };
  /** A delivery note with the same number already registered: the photo was probably sent twice */
  duplicate: { id: string; number: string | null; customerId: string } | null;
};
