import type { NonEmptyArray } from '../shared/types';
import type { GestoriaInvitationStatus, GestoriaModule } from './gestorias.types';
import { index, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { GESTORIA_CLIENT_ID_PREFIX, GESTORIA_ID_PREFIX, GESTORIA_INVITATION_ID_PREFIX, GESTORIA_INVITATION_STATUS, GESTORIA_INVITATION_STATUS_LIST, GESTORIA_MEMBER_ID_PREFIX } from './gestorias.constants';

// An accounting firm. Created by an admin from the back office, it has no organization of its own
export const gestoriasTable = pgTable('gestorias', {
  ...createPrimaryKeyField({ prefix: GESTORIA_ID_PREFIX }),
  ...createTimestampColumns(),

  name: text('name').notNull(),
  taxId: text('tax_id'),
  email: text('email'),
});

// The people working at the gestoría, regular users of the app
export const gestoriaMembersTable = pgTable('gestoria_members', {
  ...createPrimaryKeyField({ prefix: GESTORIA_MEMBER_ID_PREFIX }),
  ...createTimestampColumns(),

  gestoriaId: text('gestoria_id').notNull().references(() => gestoriasTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userId: text('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
}, table => [
  unique('gestoria_members_gestoria_user_unique').on(table.gestoriaId, table.userId),
  // To find the gestorías of a user
  index('gestoria_members_user_id_index').on(table.userId),
]);

// The companies a gestoría keeps the books of, and what it can read of each one. Only an admin grants this access
export const gestoriaClientsTable = pgTable('gestoria_clients', {
  ...createPrimaryKeyField({ prefix: GESTORIA_CLIENT_ID_PREFIX }),
  ...createTimestampColumns(),

  gestoriaId: text('gestoria_id').notNull().references(() => gestoriasTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  modules: jsonb('modules').notNull().$type<GestoriaModule[]>().default([]),
  grantedBy: text('granted_by').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
}, table => [
  unique('gestoria_clients_gestoria_organization_unique').on(table.gestoriaId, table.organizationId),
  // To list the gestorías that can read a company
  index('gestoria_clients_organization_id_index').on(table.organizationId),
]);

// People invited to the gestoría before they have an account: they become members when they sign up with this email
export const gestoriaInvitationsTable = pgTable('gestoria_invitations', {
  ...createPrimaryKeyField({ prefix: GESTORIA_INVITATION_ID_PREFIX }),
  ...createTimestampColumns(),

  gestoriaId: text('gestoria_id').notNull().references(() => gestoriasTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  email: text('email').notNull(),
  status: text('status', { enum: GESTORIA_INVITATION_STATUS_LIST as NonEmptyArray<GestoriaInvitationStatus> }).default(GESTORIA_INVITATION_STATUS.PENDING).notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  inviterId: text('inviter_id').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
}, table => [
  unique('gestoria_invitations_gestoria_email_unique').on(table.gestoriaId, table.email),
  // To find the invitations of someone signing in
  index('gestoria_invitations_email_index').on(table.email),
]);
