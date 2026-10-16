import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';

export const usersTable = pgTable(
  'users',
  {
    ...createPrimaryKeyField({ prefix: 'usr' }),
    ...createTimestampColumns(),

    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    phone: text('phone'),
    image: text('image'),
    maxOrganizationCount: integer('max_organization_count'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { mode: 'date', withTimezone: true, precision: 3 }),
    onboardingStep: text('onboarding_step'),
  },
  table => [
    index('users_email_index').on(table.email),
  ],
);
