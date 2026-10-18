import type { Database } from '../app/database/database.types';
import type { ReminderEntityType, ReminderStatus, ReminderType } from './notifications.constants';
import type { ReminderData } from './notifications.tables';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { remindersTable } from './notifications.tables';

export type Reminder = typeof remindersTable.$inferSelect;

export type ReminderPlan = {
  key: string;
  type: ReminderType;
  targetDate: Date;
  entityType: ReminderEntityType | null;
  entityId: string | null;
  data: ReminderData;
};

export type RemindersRepository = ReturnType<typeof createRemindersRepository>;

export function createRemindersRepository({ db }: { db: Database }) {
  return {
    syncInstalmentReminders: async (args: { organizationId: string; paymentInstalmentId: string; reminders: ReminderPlan[]; now?: Date }) => syncInstalmentReminders({ db, ...args }),
    listReminders: async (args: { organizationId: string; status?: ReminderStatus; from?: Date; to?: Date }) => listReminders({ db, ...args }),
    getPendingRemindersInWindow: async (args: { from: Date; to: Date }) => getPendingRemindersInWindow({ db, ...args }),
    markRemindersSent: async (args: { reminderIds: string[]; now?: Date }) => markRemindersSent({ db, ...args }),
  };
}

// Makes the reminders of a due date match the plan: new ones are added, pending ones updated (the date moved, the amount
// changed...), pending ones no longer planned deleted. A reminder already sent or dismissed by the user is left alone.
async function syncInstalmentReminders({ db, organizationId, paymentInstalmentId, reminders, now = new Date() }: { db: Database; organizationId: string; paymentInstalmentId: string; reminders: ReminderPlan[]; now?: Date }) {
  const existing = await db.select().from(remindersTable).where(and(eq(remindersTable.organizationId, organizationId), eq(remindersTable.paymentInstalmentId, paymentInstalmentId)));
  const existingByKey = new Map(existing.map(reminder => [reminder.key, reminder]));
  const plannedKeys = new Set(reminders.map(({ key }) => key));

  const stale = existing.filter(reminder => reminder.status === 'pending' && !plannedKeys.has(reminder.key)).map(({ id }) => id);
  if (stale.length > 0) {
    await db.delete(remindersTable).where(inArray(remindersTable.id, stale));
  }

  for (const reminder of reminders) {
    const current = existingByKey.get(reminder.key);

    if (current === undefined) {
      await db.insert(remindersTable).values({ organizationId, paymentInstalmentId, status: 'pending', ...reminder });
      continue;
    }

    if (current.status === 'pending') {
      await db.update(remindersTable).set({ ...reminder, updatedAt: now }).where(eq(remindersTable.id, current.id));
    }
  }
}

async function listReminders({ db, organizationId, status, from, to }: { db: Database; organizationId: string; status?: ReminderStatus; from?: Date; to?: Date }) {
  const reminders = await db
    .select()
    .from(remindersTable)
    .where(and(
      eq(remindersTable.organizationId, organizationId),
      status === undefined ? undefined : eq(remindersTable.status, status),
      from === undefined ? undefined : gte(remindersTable.targetDate, from),
      to === undefined ? undefined : lte(remindersTable.targetDate, to),
    ))
    .orderBy(asc(remindersTable.targetDate));

  return { reminders };
}

async function getPendingRemindersInWindow({ db, from, to }: { db: Database; from: Date; to: Date }) {
  const reminders = await db
    .select()
    .from(remindersTable)
    .where(and(eq(remindersTable.status, 'pending'), gte(remindersTable.targetDate, from), lte(remindersTable.targetDate, to)))
    .orderBy(asc(remindersTable.organizationId), asc(remindersTable.targetDate));

  return { reminders };
}

async function markRemindersSent({ db, reminderIds, now = new Date() }: { db: Database; reminderIds: string[]; now?: Date }) {
  if (reminderIds.length === 0) {
    return;
  }

  await db.update(remindersTable).set({ status: 'sent', sentAt: now, updatedAt: now }).where(and(inArray(remindersTable.id, reminderIds), eq(remindersTable.status, 'pending')));
}
