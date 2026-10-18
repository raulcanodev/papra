import type { DeliveryNote } from './delivery-notes.types';
import { describe, expect, test } from 'vitest';
import { getPendingDeliveryNotesByCustomer } from './delivery-notes.models';

function deliveryNote(overrides: Partial<DeliveryNote>): DeliveryNote {
  return {
    id: 'dln_1',
    organizationId: 'org_1',
    customerId: 'ctc_bar',
    customerName: 'Bar Pepe',
    customerIcon: null,
    customerIconColor: null,
    number: null,
    date: new Date('2026-10-10'),
    notes: null,
    documentId: null,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    status: 'pending',
    createdAt: new Date('2026-10-10'),
    updatedAt: new Date('2026-10-10'),
    ...overrides,
  };
}

describe('delivery-notes models', () => {
  describe('getPendingDeliveryNotesByCustomer', () => {
    test('the pending delivery notes are grouped by customer, the oldest delivery first, the invoiced ones left out', () => {
      const groups = getPendingDeliveryNotesByCustomer({ deliveryNotes: [
        deliveryNote({ id: 'dln_1', date: new Date('2026-10-12') }),
        deliveryNote({ id: 'dln_2', customerId: 'ctc_shop', customerName: 'Tienda Ana', date: new Date('2026-10-01') }),
        deliveryNote({ id: 'dln_3', date: new Date('2026-10-14') }),
        deliveryNote({ id: 'dln_4', status: 'invoiced', invoiceId: 'inv_1' }),
        deliveryNote({ id: 'dln_5', date: new Date('2026-10-11') }),
      ] });

      expect(groups.map(({ customerName, deliveryNoteIds }) => ({ customerName, deliveryNoteIds }))).to.eql([
        { customerName: 'Tienda Ana', deliveryNoteIds: ['dln_2'] },
        { customerName: 'Bar Pepe', deliveryNoteIds: ['dln_1', 'dln_3', 'dln_5'] },
      ]);
    });
  });
});
