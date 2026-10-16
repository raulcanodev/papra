import type { Database } from '../app/database/database.types';
import type { GestoriaModule } from './gestorias.types';
import { injectArguments } from '@corentinth/chisels';
import { and, asc, count, eq, gt, ilike, inArray, isNull, max, notInArray, or, sql } from 'drizzle-orm';
import { invoicesTable, invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { organizationsTable } from '../organizations/organizations.table';
import { purchaseInvoicesTable } from '../purchases/purchases.tables';
import { isUniqueConstraintError } from '../shared/db/constraints.models';
import { usersTable } from '../users/users.table';
import { GESTORIA_INVITATION_STATUS } from './gestorias.constants';
import { createGestoriaClientAlreadyExistsError, createGestoriaMemberAlreadyExistsError } from './gestorias.errors';
import { gestoriaClientsTable, gestoriaInvitationsTable, gestoriaMembersTable, gestoriasTable } from './gestorias.tables';

export type GestoriasRepository = ReturnType<typeof createGestoriasRepository>;

// Invoices a gestoría never sees: drafts are not on the books yet, and an invoice being issued is not final
export const GESTORIA_HIDDEN_INVOICE_STATUSES = ['draft', 'issuing'];

export function createGestoriasRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      listGestorias,
      getGestoriaById,
      createGestoria,
      updateGestoria,
      deleteGestoria,
      getGestoriaMembers,
      addGestoriaMember,
      removeGestoriaMember,
      getGestoriaInvitations,
      saveGestoriaInvitation,
      deleteGestoriaInvitation,
      getPendingGestoriaInvitationsCount,
      acceptPendingGestoriaInvitations,
      getGestoriaClients,
      addGestoriaClient,
      updateGestoriaClientModules,
      removeGestoriaClient,
      getOrganizationGestorias,
      getUserGestorias,
      isUserInGestoria,
      getGestoriaClientAccess,
      getGestoriaClientsActivity,
    },
    { db },
  );
}

// Back office

async function listGestorias({ db, search }: { db: Database; search?: string }) {
  const term = search?.trim();

  const gestorias = await db
    .select({
      id: gestoriasTable.id,
      name: gestoriasTable.name,
      taxId: gestoriasTable.taxId,
      email: gestoriasTable.email,
      createdAt: gestoriasTable.createdAt,
      updatedAt: gestoriasTable.updatedAt,
      memberCount: sql<number>`(SELECT count(*) FROM ${gestoriaMembersTable} WHERE ${gestoriaMembersTable.gestoriaId} = ${gestoriasTable.id})`.mapWith(Number),
      clientCount: sql<number>`(SELECT count(*) FROM ${gestoriaClientsTable} WHERE ${gestoriaClientsTable.gestoriaId} = ${gestoriasTable.id})`.mapWith(Number),
    })
    .from(gestoriasTable)
    .where(term !== undefined && term !== '' ? or(ilike(gestoriasTable.name, `%${term}%`), ilike(gestoriasTable.taxId, `%${term}%`), eq(gestoriasTable.id, term)) : undefined)
    .orderBy(asc(gestoriasTable.name));

  return { gestorias };
}

async function getGestoriaById({ db, gestoriaId }: { db: Database; gestoriaId: string }) {
  const [gestoria] = await db.select().from(gestoriasTable).where(eq(gestoriasTable.id, gestoriaId)).limit(1);

  return { gestoria: gestoria ?? null };
}

async function createGestoria({ db, gestoria: values }: { db: Database; gestoria: { name: string; taxId?: string | null; email?: string | null } }) {
  const [gestoria] = await db.insert(gestoriasTable).values(values).returning();

  if (!gestoria) {
    // Guard for type safety, the database always returns the inserted row
    throw new Error('Failed to create gestoría');
  }

  return { gestoria };
}

async function updateGestoria({ db, gestoriaId, gestoria: values, now = new Date() }: { db: Database; gestoriaId: string; gestoria: { name: string; taxId?: string | null; email?: string | null }; now?: Date }) {
  const [gestoria] = await db.update(gestoriasTable).set({ ...values, updatedAt: now }).where(eq(gestoriasTable.id, gestoriaId)).returning();

  return { gestoria: gestoria ?? null };
}

async function deleteGestoria({ db, gestoriaId }: { db: Database; gestoriaId: string }) {
  await db.delete(gestoriasTable).where(eq(gestoriasTable.id, gestoriaId));
}

async function getGestoriaMembers({ db, gestoriaId }: { db: Database; gestoriaId: string }) {
  const members = await db
    .select({
      id: gestoriaMembersTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: gestoriaMembersTable.createdAt,
    })
    .from(gestoriaMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, gestoriaMembersTable.userId))
    .where(eq(gestoriaMembersTable.gestoriaId, gestoriaId))
    .orderBy(asc(gestoriaMembersTable.createdAt));

  return { members };
}

async function addGestoriaMember({ db, gestoriaId, userId }: { db: Database; gestoriaId: string; userId: string }) {
  try {
    const [member] = await db.insert(gestoriaMembersTable).values({ gestoriaId, userId }).returning();

    return { member: member! };
  } catch (error) {
    if (isUniqueConstraintError({ error })) {
      throw createGestoriaMemberAlreadyExistsError();
    }

    throw error;
  }
}

async function removeGestoriaMember({ db, gestoriaId, memberId }: { db: Database; gestoriaId: string; memberId: string }) {
  const removed = await db
    .delete(gestoriaMembersTable)
    .where(and(eq(gestoriaMembersTable.id, memberId), eq(gestoriaMembersTable.gestoriaId, gestoriaId)))
    .returning({ id: gestoriaMembersTable.id });

  return { isRemoved: removed.length > 0 };
}

/** The invitations not accepted yet, expired ones included so the admin sees they must invite again */
async function getGestoriaInvitations({ db, gestoriaId }: { db: Database; gestoriaId: string }) {
  const invitations = await db
    .select({
      id: gestoriaInvitationsTable.id,
      email: gestoriaInvitationsTable.email,
      expiresAt: gestoriaInvitationsTable.expiresAt,
      createdAt: gestoriaInvitationsTable.createdAt,
      updatedAt: gestoriaInvitationsTable.updatedAt,
    })
    .from(gestoriaInvitationsTable)
    .where(and(eq(gestoriaInvitationsTable.gestoriaId, gestoriaId), eq(gestoriaInvitationsTable.status, GESTORIA_INVITATION_STATUS.PENDING)))
    .orderBy(asc(gestoriaInvitationsTable.createdAt));

  return { invitations };
}

/** Inviting the same email again renews the invitation, whatever happened to the previous one */
async function saveGestoriaInvitation({ db, gestoriaId, email, inviterId, expiresAt, now = new Date() }: { db: Database; gestoriaId: string; email: string; inviterId: string; expiresAt: Date; now?: Date }) {
  const [invitation] = await db
    .insert(gestoriaInvitationsTable)
    .values({ gestoriaId, email, inviterId, expiresAt, status: GESTORIA_INVITATION_STATUS.PENDING })
    .onConflictDoUpdate({
      target: [gestoriaInvitationsTable.gestoriaId, gestoriaInvitationsTable.email],
      set: { inviterId, expiresAt, status: GESTORIA_INVITATION_STATUS.PENDING, updatedAt: now },
    })
    .returning();

  if (!invitation) {
    // Guard for type safety, the database always returns the upserted row
    throw new Error('Failed to save gestoría invitation');
  }

  return { invitation };
}

async function deleteGestoriaInvitation({ db, gestoriaId, invitationId }: { db: Database; gestoriaId: string; invitationId: string }) {
  const removed = await db
    .delete(gestoriaInvitationsTable)
    .where(and(
      eq(gestoriaInvitationsTable.id, invitationId),
      eq(gestoriaInvitationsTable.gestoriaId, gestoriaId),
      eq(gestoriaInvitationsTable.status, GESTORIA_INVITATION_STATUS.PENDING),
    ))
    .returning({ id: gestoriaInvitationsTable.id });

  return { isRemoved: removed.length > 0 };
}

async function getPendingGestoriaInvitationsCount({ db, email, now = new Date() }: { db: Database; email: string; now?: Date }) {
  const [result] = await db
    .select({ pendingInvitationsCount: count() })
    .from(gestoriaInvitationsTable)
    .where(and(
      eq(gestoriaInvitationsTable.email, email),
      eq(gestoriaInvitationsTable.status, GESTORIA_INVITATION_STATUS.PENDING),
      gt(gestoriaInvitationsTable.expiresAt, now),
    ));

  return { pendingInvitationsCount: result?.pendingInvitationsCount ?? 0 };
}

/**
 * Turns the pending invitations of an email into memberships of its user. Safe to run concurrently or again:
 * an existing membership is kept, an invitation is only accepted once.
 */
async function acceptPendingGestoriaInvitations({ db, userId, email, now = new Date() }: { db: Database; userId: string; email: string; now?: Date }) {
  return db.transaction(async (tx) => {
    const accepted = await tx
      .update(gestoriaInvitationsTable)
      .set({ status: GESTORIA_INVITATION_STATUS.ACCEPTED, updatedAt: now })
      .where(and(
        eq(gestoriaInvitationsTable.email, email),
        eq(gestoriaInvitationsTable.status, GESTORIA_INVITATION_STATUS.PENDING),
        gt(gestoriaInvitationsTable.expiresAt, now),
      ))
      .returning({ gestoriaId: gestoriaInvitationsTable.gestoriaId });

    if (accepted.length > 0) {
      await tx
        .insert(gestoriaMembersTable)
        .values(accepted.map(({ gestoriaId }) => ({ gestoriaId, userId })))
        .onConflictDoNothing();
    }

    return { acceptedGestoriaIds: accepted.map(({ gestoriaId }) => gestoriaId) };
  });
}

/** The client companies of a gestoría, by name, with the fiscal identity of each one when filled in */
async function getGestoriaClients({ db, gestoriaId, includeDeleted = false }: { db: Database; gestoriaId: string; includeDeleted?: boolean }) {
  const clients = await db
    .select({
      id: gestoriaClientsTable.id,
      organizationId: organizationsTable.id,
      name: organizationsTable.name,
      legalName: invoicingProfilesTable.legalName,
      taxId: invoicingProfilesTable.taxId,
      legalForm: invoicingProfilesTable.legalForm,
      modules: gestoriaClientsTable.modules,
      isDeleted: sql<boolean>`${organizationsTable.deletedAt} IS NOT NULL`,
      createdAt: gestoriaClientsTable.createdAt,
      updatedAt: gestoriaClientsTable.updatedAt,
    })
    .from(gestoriaClientsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, gestoriaClientsTable.organizationId))
    .leftJoin(invoicingProfilesTable, eq(invoicingProfilesTable.organizationId, organizationsTable.id))
    .where(and(
      eq(gestoriaClientsTable.gestoriaId, gestoriaId),
      includeDeleted ? undefined : isNull(organizationsTable.deletedAt),
    ))
    .orderBy(asc(organizationsTable.name));

  return { clients };
}

async function addGestoriaClient({ db, gestoriaId, organizationId, modules, grantedBy }: { db: Database; gestoriaId: string; organizationId: string; modules: GestoriaModule[]; grantedBy: string }) {
  try {
    const [client] = await db.insert(gestoriaClientsTable).values({ gestoriaId, organizationId, modules, grantedBy }).returning();

    return { client: client! };
  } catch (error) {
    if (isUniqueConstraintError({ error })) {
      throw createGestoriaClientAlreadyExistsError();
    }

    throw error;
  }
}

async function updateGestoriaClientModules({ db, gestoriaId, organizationId, modules, grantedBy, now = new Date() }: { db: Database; gestoriaId: string; organizationId: string; modules: GestoriaModule[]; grantedBy: string; now?: Date }) {
  const [client] = await db
    .update(gestoriaClientsTable)
    .set({ modules, grantedBy, updatedAt: now })
    .where(and(eq(gestoriaClientsTable.gestoriaId, gestoriaId), eq(gestoriaClientsTable.organizationId, organizationId)))
    .returning();

  return { client: client ?? null };
}

async function removeGestoriaClient({ db, gestoriaId, organizationId }: { db: Database; gestoriaId: string; organizationId: string }) {
  const removed = await db
    .delete(gestoriaClientsTable)
    .where(and(eq(gestoriaClientsTable.gestoriaId, gestoriaId), eq(gestoriaClientsTable.organizationId, organizationId)))
    .returning({ id: gestoriaClientsTable.id });

  return { isRemoved: removed.length > 0 };
}

/** The gestorías that can read a company, for its back office page */
async function getOrganizationGestorias({ db, organizationId }: { db: Database; organizationId: string }) {
  const gestorias = await db
    .select({ id: gestoriasTable.id, name: gestoriasTable.name, modules: gestoriaClientsTable.modules, createdAt: gestoriaClientsTable.createdAt })
    .from(gestoriaClientsTable)
    .innerJoin(gestoriasTable, eq(gestoriasTable.id, gestoriaClientsTable.gestoriaId))
    .where(eq(gestoriaClientsTable.organizationId, organizationId))
    .orderBy(asc(gestoriasTable.name));

  return { gestorias };
}

// Gestoría workspace

async function getUserGestorias({ db, userId }: { db: Database; userId: string }) {
  const gestorias = await db
    .select({ id: gestoriasTable.id, name: gestoriasTable.name, taxId: gestoriasTable.taxId })
    .from(gestoriaMembersTable)
    .innerJoin(gestoriasTable, eq(gestoriasTable.id, gestoriaMembersTable.gestoriaId))
    .where(eq(gestoriaMembersTable.userId, userId))
    .orderBy(asc(gestoriasTable.name));

  return { gestorias };
}

async function isUserInGestoria({ db, userId, gestoriaId }: { db: Database; userId: string; gestoriaId: string }) {
  const [member] = await db
    .select({ id: gestoriaMembersTable.id })
    .from(gestoriaMembersTable)
    .where(and(eq(gestoriaMembersTable.userId, userId), eq(gestoriaMembersTable.gestoriaId, gestoriaId)))
    .limit(1);

  return { isInGestoria: member !== undefined };
}

/** The access of a gestoría to a company: none when it is not a client, or when the company was deleted */
async function getGestoriaClientAccess({ db, gestoriaId, organizationId }: { db: Database; gestoriaId: string; organizationId: string }) {
  const [access] = await db
    .select({ modules: gestoriaClientsTable.modules, organizationName: organizationsTable.name })
    .from(gestoriaClientsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, gestoriaClientsTable.organizationId))
    .where(and(
      eq(gestoriaClientsTable.gestoriaId, gestoriaId),
      eq(gestoriaClientsTable.organizationId, organizationId),
      isNull(organizationsTable.deletedAt),
    ))
    .limit(1);

  return { access: access ?? null };
}

/** For each company, its issued and received invoices of the period and when its books last changed */
async function getGestoriaClientsActivity({ db, organizationIds, from, to }: { db: Database; organizationIds: string[]; from: Date; to: Date }) {
  if (organizationIds.length === 0) {
    return { activity: [] };
  }

  // The period bounds as parameters of a raw filter: ISO strings, cast by postgres
  const isInPeriod = (column: typeof invoicesTable.issueDate | typeof purchaseInvoicesTable.issueDate) => sql`${column} >= ${from.toISOString()}::timestamptz AND ${column} < ${to.toISOString()}::timestamptz`;

  const [issued, received] = await Promise.all([
    db
      .select({
        organizationId: invoicesTable.organizationId,
        periodCount: sql<number>`count(*) FILTER (WHERE ${isInPeriod(invoicesTable.issueDate)})`.mapWith(Number),
        periodBaseMinor: sql<number>`coalesce(sum(${invoicesTable.subtotalMinor}) FILTER (WHERE ${isInPeriod(invoicesTable.issueDate)}), 0)`.mapWith(Number),
        periodTaxMinor: sql<number>`coalesce(sum(${invoicesTable.taxMinor}) FILTER (WHERE ${isInPeriod(invoicesTable.issueDate)}), 0)`.mapWith(Number),
        lastUpdatedAt: max(invoicesTable.updatedAt),
      })
      .from(invoicesTable)
      .where(and(inArray(invoicesTable.organizationId, organizationIds), notInArray(invoicesTable.status, GESTORIA_HIDDEN_INVOICE_STATUSES)))
      .groupBy(invoicesTable.organizationId),
    db
      .select({
        organizationId: purchaseInvoicesTable.organizationId,
        periodCount: sql<number>`count(*) FILTER (WHERE ${isInPeriod(purchaseInvoicesTable.issueDate)})`.mapWith(Number),
        periodBaseMinor: sql<number>`coalesce(sum(${purchaseInvoicesTable.subtotalMinor}) FILTER (WHERE ${isInPeriod(purchaseInvoicesTable.issueDate)}), 0)`.mapWith(Number),
        periodTaxMinor: sql<number>`coalesce(sum(${purchaseInvoicesTable.deductibleTaxMinor}) FILTER (WHERE ${isInPeriod(purchaseInvoicesTable.issueDate)}), 0)`.mapWith(Number),
        lastUpdatedAt: max(purchaseInvoicesTable.updatedAt),
      })
      .from(purchaseInvoicesTable)
      .where(inArray(purchaseInvoicesTable.organizationId, organizationIds))
      .groupBy(purchaseInvoicesTable.organizationId),
  ]);

  return {
    activity: organizationIds.map((organizationId) => {
      const issuedRow = issued.find(row => row.organizationId === organizationId);
      const receivedRow = received.find(row => row.organizationId === organizationId);

      return {
        organizationId,
        issued: { count: issuedRow?.periodCount ?? 0, baseMinor: issuedRow?.periodBaseMinor ?? 0, taxMinor: issuedRow?.periodTaxMinor ?? 0, lastUpdatedAt: issuedRow?.lastUpdatedAt ?? null },
        received: { count: receivedRow?.periodCount ?? 0, baseMinor: receivedRow?.periodBaseMinor ?? 0, taxMinor: receivedRow?.periodTaxMinor ?? 0, lastUpdatedAt: receivedRow?.lastUpdatedAt ?? null },
      };
    }),
  };
}
