import type { InstalmentInput, InstalmentStatus, PaymentMethod } from '../../due-dates/due-dates.types';
import { addDays } from '../../due-dates/due-dates.models';
import { createId } from '../demo.models';

/** A due date as kept inside its demo purchase (the server has a table of its own) */
export type DemoStoredInstalment = {
  id: string;
  dueDate: string;
  amountMinor: number;
  paymentMethod: PaymentMethod | null;
  status: InstalmentStatus;
  paidAt: string | null;
  returnedAt: string | null;
  position: number;
};

function statusDates({ status, previous, now }: { status: InstalmentStatus; previous?: DemoStoredInstalment; now: string }) {
  return {
    paidAt: status === 'paid' ? (previous?.status === 'paid' ? previous.paidAt : now) : null,
    returnedAt: status === 'returned' ? (previous?.status === 'returned' ? previous.returnedAt : now) : null,
  };
}

// Same rules as the server: the due dates typed by the user, or one on the due date or after the supplier terms,
// none for a delivery note; matched by position so each one keeps its status
export function buildDemoInstalments({ draft, existing = [], supplierTermsDays, payableMinor, now = new Date().toISOString() }: {
  draft: { kind: string; issueDate: Date | string; dueDate?: Date | string | null; paymentMethod?: PaymentMethod | null; instalments?: InstalmentInput[] };
  existing?: DemoStoredInstalment[];
  supplierTermsDays: number;
  payableMinor: number;
  now?: string;
}): DemoStoredInstalment[] {
  if (draft.kind === 'delivery_note') {
    return [];
  }

  const inputs: InstalmentInput[] = draft.instalments && draft.instalments.length > 0
    ? draft.instalments
    : [{ dueDate: draft.dueDate ? new Date(draft.dueDate) : addDays(new Date(draft.issueDate), supplierTermsDays), amountMinor: payableMinor }];

  return inputs.map((input, position) => {
    const previous = existing[position];
    const status = input.status ?? previous?.status ?? 'pending';

    return {
      id: previous?.id ?? createId({ prefix: 'pins' }),
      dueDate: new Date(input.dueDate).toISOString(),
      amountMinor: input.amountMinor,
      paymentMethod: input.paymentMethod ?? draft.paymentMethod ?? null,
      status,
      ...statusDates({ status, previous, now }),
      position,
    };
  });
}

export function setDemoInstalmentStatus({ instalment, status, now = new Date().toISOString() }: { instalment: DemoStoredInstalment; status: InstalmentStatus; now?: string }): DemoStoredInstalment {
  return { ...instalment, status, ...statusDates({ status, previous: instalment, now }) };
}

/** The invoice follows its due dates: paid once all of them are */
export function getDemoSettledState(instalments: DemoStoredInstalment[]) {
  const isPaid = instalments.length > 0 && instalments.every(({ status }) => status === 'paid');

  return { status: isPaid ? 'paid' as const : 'pending' as const, paidAt: isPaid ? instalments.map(({ paidAt }) => paidAt ?? '').toSorted().at(-1) ?? null : null };
}
