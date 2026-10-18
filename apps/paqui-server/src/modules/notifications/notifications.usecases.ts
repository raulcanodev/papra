import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { EmailsServices } from '../emails/emails.services';
import type { Reminder } from './notifications.repository';
import { buildUrl, safely } from '@corentinth/chisels';
import { and, asc, eq } from 'drizzle-orm';
import { getClientBaseUrl } from '../config/config.models';
import { createDueDatesRepository } from '../due-dates/due-dates.repository';
import { invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { ORGANIZATION_ROLES } from '../organizations/organizations.constants';
import { organizationMembersTable, organizationsTable } from '../organizations/organizations.table';
import { sanitize } from '../shared/html/html';
import { createLogger } from '../shared/logger/logger';
import { usersTable } from '../users/users.table';
import { MAX_REMINDER_EMAIL_DELAY_DAYS } from './notifications.constants';
import { createRemindersRepository } from './notifications.repository';

const logger = createLogger({ namespace: 'notifications:reminders' });

type Language = 'es' | 'en';

const TYPE_LABELS: Record<Language, Record<Reminder['type'], string>> = {
  es: { payment_due: 'Pago próximo', collection_due: 'Cobro próximo', payment_overdue: 'Pago vencido', collection_overdue: 'Cobro vencido' },
  en: { payment_due: 'Payment due', collection_due: 'Collection due', payment_overdue: 'Payment overdue', collection_overdue: 'Collection overdue' },
};

const COPY: Record<Language, { subject: (count: number) => string; intro: string; cta: string; footer: string }> = {
  es: {
    subject: count => (count === 1 ? 'Tienes 1 vencimiento' : `Tienes ${count} vencimientos`),
    intro: 'Estos son los vencimientos de hoy y de los próximos días:',
    cta: 'Ver vencimientos',
    footer: 'Recibes este correo porque los avisos de vencimientos por email están activados en Paqui.',
  },
  en: {
    subject: count => (count === 1 ? 'You have 1 due date' : `You have ${count} due dates`),
    intro: 'These are your due dates for today and the next few days:',
    cta: 'See due dates',
    footer: 'You receive this email because due date email reminders are turned on in Paqui.',
  },
};

// One email per organization with all its reminders of the day
export function buildRemindersEmail({ reminders, language, locale, dueDatesUrl }: { reminders: Reminder[]; language: Language; locale: string; dueDatesUrl: string }) {
  const copy = COPY[language];
  const money = (amountMinor: number, currency: string) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));

  const rows = reminders.map(({ type, data }) => `
    <tr>
      <td style="padding:6px 12px 6px 0">${TYPE_LABELS[language][type]}</td>
      <td style="padding:6px 12px 6px 0">${sanitize(data.title)}</td>
      <td style="padding:6px 12px 6px 0">${data.dueDate === undefined ? '' : date(data.dueDate)}</td>
      <td style="padding:6px 0;text-align:right">${data.amountMinor === undefined ? '' : money(data.amountMinor, data.currency ?? 'EUR')}</td>
    </tr>`).join('');

  return {
    subject: copy.subject(reminders.length),
    html: `
      <p>${copy.intro}</p>
      <table style="border-collapse:collapse">${rows}</table>
      <p><a href="${dueDatesUrl}">${copy.cta}</a></p>
      <p style="color:#6b7280;font-size:12px">${copy.footer}</p>
    `,
  };
}

async function getOrganizationRecipient({ db, organizationId, reminderEmail }: { db: Database; organizationId: string; reminderEmail: string | null }) {
  if (reminderEmail !== null) {
    return reminderEmail;
  }

  const [owner] = await db
    .select({ email: usersTable.email })
    .from(organizationMembersTable)
    .innerJoin(usersTable, eq(organizationMembersTable.userId, usersTable.id))
    .where(and(eq(organizationMembersTable.organizationId, organizationId), eq(organizationMembersTable.role, ORGANIZATION_ROLES.OWNER)))
    .orderBy(asc(organizationMembersTable.createdAt))
    .limit(1);

  return owner?.email ?? null;
}

// The entry point of the email reminders, run once a day by the send-due-reminders task: the pending reminders of
// the last few days are emailed to the organizations that turned the emails on, then marked sent. The others stay
// pending (and visible in the app). One organization failing does not stop the others.
export async function sendDueReminders({ db, emailsServices, config, now = new Date() }: { db: Database; emailsServices: Pick<EmailsServices, 'sendEmail'>; config: Config; now?: Date }) {
  const remindersRepository = createRemindersRepository({ db });
  const dueDatesRepository = createDueDatesRepository({ db });
  const { reminders } = await remindersRepository.getPendingRemindersInWindow({ from: new Date(now.getTime() - MAX_REMINDER_EMAIL_DELAY_DAYS * 86_400_000), to: now });

  const byOrganization = Map.groupBy(reminders, ({ organizationId }) => organizationId);
  let sentCount = 0;

  for (const [organizationId, organizationReminders] of byOrganization) {
    const { settings } = await dueDatesRepository.getSettings({ organizationId });

    if (!settings.emailRemindersEnabled) {
      continue;
    }

    const [, error] = await safely((async () => {
      const recipient = await getOrganizationRecipient({ db, organizationId, reminderEmail: settings.reminderEmail });

      if (recipient === null) {
        logger.warn({ organizationId }, 'No recipient for the due reminders');
        return;
      }

      const [[profile], [organization]] = await Promise.all([
        db.select({ locale: invoicingProfilesTable.locale }).from(invoicingProfilesTable).where(eq(invoicingProfilesTable.organizationId, organizationId)).limit(1),
        db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.id, organizationId)).limit(1),
      ]);

      if (!organization) {
        return;
      }

      const locale = profile?.locale ?? 'es-ES';
      const { clientBaseUrl } = getClientBaseUrl({ config });
      const { subject, html } = buildRemindersEmail({
        reminders: organizationReminders,
        language: locale.toLowerCase().startsWith('es') ? 'es' : 'en',
        locale,
        dueDatesUrl: buildUrl({ baseUrl: clientBaseUrl, path: `/organizations/${organizationId}/due-dates` }),
      });

      await emailsServices.sendEmail({ to: recipient, subject, html });
      await remindersRepository.markRemindersSent({ reminderIds: organizationReminders.map(({ id }) => id), now });
      sentCount += organizationReminders.length;
    })());

    if (error) {
      logger.error({ error, organizationId }, 'Failed to send the due reminders');
    }
  }

  return { sentCount };
}
