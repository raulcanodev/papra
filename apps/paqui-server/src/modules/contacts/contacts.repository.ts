import type { Database } from '../app/database/database.types';
import type { ContactRole } from './contacts.constants';
import type { ContactInput } from './contacts.models';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { documentFoldersTable } from '../documents/document-folders.table';
import { createContactNotFoundError, createContactRoleRequiredError } from './contacts.errors';
import { CONTACT_ROLE_COLUMNS, contactHasDocumentsFolder, hasContactRole } from './contacts.models';
import { contactsTable } from './contacts.table';

export type ContactsRepository = ReturnType<typeof createContactsRepository>;

export function createContactsRepository({ db }: { db: Database }) {
  return {
    listContacts: async (args: { organizationId: string; role?: ContactRole }) => listContacts({ db, ...args }),
    getContact: async (args: { organizationId: string; contactId: string }) => getContact({ db, ...args }),
    getContactWithRole: async (args: { organizationId: string; contactId: string; role: ContactRole }) => getContactWithRole({ db, ...args }),
    createContact: async (args: { organizationId: string; contact: ContactInput }) => createContact({ db, ...args }),
    updateContact: async (args: { organizationId: string; contactId: string; contact: ContactInput }) => updateContact({ db, ...args }),
    archiveContact: async (args: { organizationId: string; contactId: string }) => archiveContact({ db, ...args }),
  };
}

async function listContacts({ db, organizationId, role }: { db: Database; organizationId: string; role?: ContactRole }) {
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(and(
      eq(contactsTable.organizationId, organizationId),
      isNull(contactsTable.archivedAt),
      role === undefined ? undefined : eq(contactsTable[CONTACT_ROLE_COLUMNS[role]], true),
    ))
    .orderBy(asc(contactsTable.name));

  return { contacts };
}

async function getContact({ db, organizationId, contactId }: { db: Database; organizationId: string; contactId: string }) {
  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.organizationId, organizationId)))
    .limit(1);

  return { contact: contact ?? null };
}

// For references from other entities (an invoice customer, its sales representative...): the contact must belong to
// the organization and play the expected role, so an invoice can never point to a contact of another organization
async function getContactWithRole({ db, organizationId, contactId, role }: { db: Database; organizationId: string; contactId: string; role: ContactRole }) {
  const { contact } = await getContact({ db, organizationId, contactId });

  if (!contact) {
    throw createContactNotFoundError();
  }

  if (!hasContactRole({ contact, role })) {
    throw createContactRoleRequiredError();
  }

  return { contact };
}

async function syncContactDocumentsFolder({ db, organizationId, contact }: { db: Database; organizationId: string; contact: typeof contactsTable.$inferSelect }) {
  if (!contactHasDocumentsFolder({ contact })) {
    return;
  }

  await db
    .insert(documentFoldersTable)
    .values({ organizationId, contactId: contact.id, name: contact.name.trim(), kind: 'contact' })
    .onConflictDoUpdate({
      target: [documentFoldersTable.organizationId, documentFoldersTable.contactId],
      targetWhere: sql`${documentFoldersTable.contactId} IS NOT NULL`,
      set: { name: contact.name.trim(), updatedAt: new Date() },
    });
}

async function createContact({ db, organizationId, contact }: { db: Database; organizationId: string; contact: ContactInput }) {
  const created = await db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const [row] = await tx.insert(contactsTable).values({ organizationId, ...contact }).returning();
    await syncContactDocumentsFolder({ db: tx, organizationId, contact: row! });

    return row!;
  });

  return { contact: created };
}

async function updateContact({ db, organizationId, contactId, contact }: { db: Database; organizationId: string; contactId: string; contact: ContactInput }) {
  const updated = await db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const [row] = await tx
      .update(contactsTable)
      .set({ ...contact, updatedAt: new Date() })
      .where(and(eq(contactsTable.id, contactId), eq(contactsTable.organizationId, organizationId)))
      .returning();

    if (row) {
      await syncContactDocumentsFolder({ db: tx, organizationId, contact: row });
    }

    return row;
  });

  if (!updated) {
    throw createContactNotFoundError();
  }

  return { contact: updated };
}

// Contacts are archived, never deleted: issued invoices, received invoices and document folders keep pointing at them
async function archiveContact({ db, organizationId, contactId }: { db: Database; organizationId: string; contactId: string }) {
  const [archived] = await db
    .update(contactsTable)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.organizationId, organizationId), isNull(contactsTable.archivedAt)))
    .returning();

  if (!archived) {
    throw createContactNotFoundError();
  }

  return { contact: archived };
}
