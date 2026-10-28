import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../../shared/db/columns.helpers';
import { usersTable } from '../../users/users.table';

export const sessionsTable = pgTable(
  'auth_sessions',
  {
    ...createPrimaryKeyField({ prefix: 'auth_ses' }),
    ...createTimestampColumns(),

    token: text('token').notNull(),
    userId: text('user_id').references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    activeOrganizationId: text('active_organization_id').references(() => organizationsTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    // The admin acting as this user, set only on the short sessions opened from the admin panel
    impersonatedBy: text('impersonated_by').references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // An impersonation is read-only unless the admin chose to be able to change things before entering
    impersonationCanWrite: boolean('impersonation_can_write').notNull().default(false),
  },
  table => [
    // To select sessions by token
    index('auth_sessions_token_index').on(table.token),
  ],
);

export const accountsTable = pgTable(
  'auth_accounts',
  {
    ...createPrimaryKeyField({ prefix: 'auth_acc' }),
    ...createTimestampColumns(),

    userId: text('user_id').references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date', withTimezone: true, precision: 3 }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date', withTimezone: true, precision: 3 }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
  },
);

export const verificationsTable = pgTable(
  'auth_verifications',
  {
    ...createPrimaryKeyField({ prefix: 'auth_ver' }),
    ...createTimestampColumns(),

    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  },
  table => [
  // To select verifications by identifier
    index('auth_verifications_identifier_index').on(table.identifier),
  ],
);

export const twoFactorTable = pgTable(
  'auth_two_factor',
  {
    ...createPrimaryKeyField({ prefix: 'auth_2fa' }),
    ...createTimestampColumns(),

    userId: text('user_id').references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    secret: text('secret'),
    backupCodes: text('backup_codes'),
  },
);
