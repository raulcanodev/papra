import type { NonEmptyArray } from '../shared/types';
import type { OrganizationInvitationStatus, OrganizationRole } from './organizations.types';
import { index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { ORGANIZATION_INVITATION_ID_PREFIX, ORGANIZATION_INVITATION_STATUS, ORGANIZATION_INVITATION_STATUS_LIST, ORGANIZATION_MEMBER_ID_PREFIX, ORGANIZATION_ROLES_LIST } from './organizations.constants';
import { generateOrganizationId } from './organizations.models';

export const organizationsTable = pgTable('organizations', {
  ...createPrimaryKeyField({ idGenerator: generateOrganizationId }),
  ...createTimestampColumns(),

  name: text('name').notNull(),
  customerId: text('customer_id'),

  deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true, precision: 3 }),
  deletedBy: text('deleted_by').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  // When the organization is soft-deleted, we schedule a purge date some days in the future for hard deletion
  scheduledPurgeAt: timestamp('scheduled_purge_at', { mode: 'date', withTimezone: true, precision: 3 }),

  onboardingCompletedAt: timestamp('onboarding_completed_at', { mode: 'date', withTimezone: true, precision: 3 }),
  onboardingStep: text('onboarding_step'),
}, t => [
  // Used to list organizations to purge
  index('organizations_deleted_at_purge_at_index').on(t.deletedAt, t.scheduledPurgeAt),
  // For a user to list their deleted organizations for possible restoration
  index('organizations_deleted_by_deleted_at_index').on(t.deletedBy, t.deletedAt),
]);

export const organizationMembersTable = pgTable('organization_members', {
  ...createPrimaryKeyField({ prefix: ORGANIZATION_MEMBER_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id')
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  userId: text('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  role: text('role', { enum: ORGANIZATION_ROLES_LIST as NonEmptyArray<OrganizationRole> }).notNull(),
}, t => [
  unique('organization_members_user_organization_unique').on(t.organizationId, t.userId),
]);

export const organizationInvitationsTable = pgTable('organization_invitations', {
  ...createPrimaryKeyField({ prefix: ORGANIZATION_INVITATION_ID_PREFIX }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  email: text('email').notNull(),
  role: text('role', { enum: ORGANIZATION_ROLES_LIST as NonEmptyArray<OrganizationRole> }).notNull(),
  status: text('status', { enum: ORGANIZATION_INVITATION_STATUS_LIST as NonEmptyArray<OrganizationInvitationStatus> }).default(ORGANIZATION_INVITATION_STATUS.PENDING).notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
  inviterId: text('inviter_id').notNull().references(() => usersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
}, t => [
  unique('organization_invitations_organization_email_unique').on(t.organizationId, t.email),
]);
