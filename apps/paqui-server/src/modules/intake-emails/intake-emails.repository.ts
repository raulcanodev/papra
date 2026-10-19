import type { Database } from '../app/database/database.types';
import { injectArguments, safely } from '@corentinth/chisels';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { isUniqueConstraintError } from '../shared/db/constraints.models';
import { createError } from '../shared/errors/errors';
import { omitUndefined } from '../shared/objects';
import { createIntakeEmailAlreadyExistsError, createIntakeEmailNotFoundError } from './intake-emails.errors';
import { intakeEmailDeliveriesTable, intakeEmailsTable } from './intake-emails.tables';

export type IntakeEmailsRepository = ReturnType<typeof createIntakeEmailsRepository>;

export function createIntakeEmailsRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      createIntakeEmail,
      updateIntakeEmail,
      getIntakeEmail,
      getOrganizationIntakeEmails,
      getIntakeEmailByEmailAddress,
      deleteIntakeEmail,
      getOrganizationIntakeEmailsCount,
      createIntakeEmailDelivery,
      getIntakeEmailDeliveryByProviderMessageId,
      listOrganizationIntakeEmailDeliveries,
    },
    { db },
  );
}

async function createIntakeEmail({ organizationId, emailAddress, allowedOrigins, db }: { organizationId: string; emailAddress: string; allowedOrigins?: string[]; db: Database }) {
  const [result, error] = await safely(db.insert(intakeEmailsTable).values({ organizationId, emailAddress: emailAddress.toLowerCase(), allowedOrigins }).returning());

  if (isUniqueConstraintError({ error })) {
    throw createIntakeEmailAlreadyExistsError();
  }

  if (error) {
    throw error;
  }

  const [intakeEmail] = result;

  if (!intakeEmail) {
    // Very unlikely to happen as the insertion should throw an issue, it's for type safety
    throw createError({
      message: 'Error while creating intake email',
      code: 'intake-emails.create_error',
      statusCode: 500,
      isInternal: true,
    });
  }

  return { intakeEmail };
}

async function updateIntakeEmail({ intakeEmailId, organizationId, isEnabled, allowedOrigins, db }: { intakeEmailId: string; organizationId: string; isEnabled?: boolean; allowedOrigins?: string[]; db: Database }) {
  const [intakeEmail] = await db
    .update(intakeEmailsTable)
    .set(
      omitUndefined({
        isEnabled,
        allowedOrigins,
      }),
    )
    .where(
      and(
        eq(intakeEmailsTable.id, intakeEmailId),
        eq(intakeEmailsTable.organizationId, organizationId),
      ),
    )
    .returning();

  if (!intakeEmail) {
    throw createIntakeEmailNotFoundError();
  }

  return { intakeEmail };
}

async function getIntakeEmail({ intakeEmailId, organizationId, db }: { intakeEmailId: string; organizationId: string; db: Database }) {
  const [intakeEmail] = await db
    .select()
    .from(intakeEmailsTable)
    .where(
      and(
        eq(intakeEmailsTable.id, intakeEmailId),
        eq(intakeEmailsTable.organizationId, organizationId),
      ),
    );

  return { intakeEmail };
}

async function getIntakeEmailByEmailAddress({ emailAddress, db }: { emailAddress: string; db: Database }) {
  const [intakeEmail] = await db
    .select()
    .from(intakeEmailsTable)
    .where(eq(sql`lower(${intakeEmailsTable.emailAddress})`, emailAddress.toLowerCase()));

  return { intakeEmail };
}

async function getOrganizationIntakeEmails({ organizationId, db }: { organizationId: string; db: Database }) {
  const intakeEmails = await db
    .select()
    .from(intakeEmailsTable)
    .where(
      eq(intakeEmailsTable.organizationId, organizationId),
    );

  return { intakeEmails };
}

async function deleteIntakeEmail({ intakeEmailId, organizationId, db }: { intakeEmailId: string; organizationId: string; db: Database }) {
  await db
    .delete(intakeEmailsTable)
    .where(
      and(
        eq(intakeEmailsTable.id, intakeEmailId),
        eq(intakeEmailsTable.organizationId, organizationId),
      ),
    );
}

async function getOrganizationIntakeEmailsCount({ organizationId, db }: { organizationId: string; db: Database }) {
  const [record] = await db
    .select({ intakeEmailCount: count() })
    .from(intakeEmailsTable)
    .where(
      eq(intakeEmailsTable.organizationId, organizationId),
    );

  if (!record) {
    throw createIntakeEmailNotFoundError();
  }

  const { intakeEmailCount } = record;

  return { intakeEmailCount };
}

async function createIntakeEmailDelivery({ db, ...delivery }: { db: Database } & typeof intakeEmailDeliveriesTable.$inferInsert) {
  const [created] = await db.insert(intakeEmailDeliveriesTable).values(delivery).returning();
  return { delivery: created! };
}

async function getIntakeEmailDeliveryByProviderMessageId({ intakeEmailId, providerMessageId, db }: { intakeEmailId: string; providerMessageId: string; db: Database }) {
  const [delivery] = await db
    .select()
    .from(intakeEmailDeliveriesTable)
    .where(and(
      eq(intakeEmailDeliveriesTable.intakeEmailId, intakeEmailId),
      eq(intakeEmailDeliveriesTable.providerMessageId, providerMessageId),
    ));

  return { delivery };
}

async function listOrganizationIntakeEmailDeliveries({ organizationId, limit = 20, db }: { organizationId: string; limit?: number; db: Database }) {
  const deliveries = await db
    .select()
    .from(intakeEmailDeliveriesTable)
    .where(eq(intakeEmailDeliveriesTable.organizationId, organizationId))
    .orderBy(desc(intakeEmailDeliveriesTable.createdAt))
    .limit(limit);

  return { deliveries };
}
