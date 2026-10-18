import type { DeliveryNote } from './delivery-notes.types';

// The pending delivery notes of each customer, the oldest delivery first: what one click invoices
export function getPendingDeliveryNotesByCustomer({ deliveryNotes }: { deliveryNotes: DeliveryNote[] }) {
  const groups = new Map<string, { customerId: string; customerName: string; customerIcon: DeliveryNote['customerIcon']; customerIconColor: DeliveryNote['customerIconColor']; deliveryNoteIds: string[]; oldestDate: Date }>();

  for (const deliveryNote of deliveryNotes.filter(({ status }) => status === 'pending')) {
    const group = groups.get(deliveryNote.customerId);

    if (group) {
      group.deliveryNoteIds.push(deliveryNote.id);
      group.oldestDate = deliveryNote.date < group.oldestDate ? deliveryNote.date : group.oldestDate;
      continue;
    }

    groups.set(deliveryNote.customerId, {
      customerId: deliveryNote.customerId,
      customerName: deliveryNote.customerName,
      customerIcon: deliveryNote.customerIcon,
      customerIconColor: deliveryNote.customerIconColor,
      deliveryNoteIds: [deliveryNote.id],
      oldestDate: deliveryNote.date,
    });
  }

  return [...groups.values()].toSorted((a, b) => a.oldestDate.getTime() - b.oldestDate.getTime());
}
