import type { z } from 'zod';
import type { Database } from '../app/database/database.types';
import type { verifactuConfigurationSchema, verifactuSystemStateSchema } from './invoicing.schemas';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createInvoiceNotFoundError, createVerifactuConfigurationIncompleteError, createVerifactuModeLockedError } from './invoicing.errors';
import { createInvoicingRepository } from './invoicing.repository';
import { verifactuConfigurationsTable, verifactuRecordsTable, verifactuSystemStateTable } from './invoicing.tables';
import { buildVerifactuQrUrl, buildVerifactuXml, calculateVerifactuHash, formatAeatAmount, formatAeatDate, formatAeatTimestamp } from './verifactu.models';

type ConfigurationInput = z.infer<typeof verifactuConfigurationSchema>;
type SystemStateInput = z.infer<typeof verifactuSystemStateSchema>;

export function createVerifactuRepository({ db }: { db: Database }) {
  return {
    getConfiguration: async (args: { organizationId: string }) => getConfiguration({ db, ...args }),
    upsertConfiguration: async (args: { organizationId: string; configuration: ConfigurationInput }) => upsertConfiguration({ db, ...args }),
    getRecordForInvoice: async (args: { organizationId: string; invoiceId: string }) => getRecordForInvoice({ db, ...args }),
    ensureInvoiceRecord: async (args: { organizationId: string; invoiceId: string; now?: Date }) => ensureInvoiceRecord({ db, ...args }),
    listRecords: async (args: { organizationId?: string }) => listRecords({ db, ...args }),
    getSystemState: async () => getSystemState({ db }),
    updateSystemState: async (args: { state: SystemStateInput }) => updateSystemState({ db, ...args }),
    getDashboard: async () => getDashboard({ db }),
  };
}

async function getConfiguration({ db, organizationId }: { db: Database; organizationId: string }) {
  const [configuration] = await db.select().from(verifactuConfigurationsTable).where(eq(verifactuConfigurationsTable.organizationId, organizationId)).limit(1);
  return { configuration: configuration ?? null };
}

async function upsertConfiguration({ db, organizationId, configuration }: { db: Database; organizationId: string; configuration: ConfigurationInput }) {
  const { configuration: current } = await getConfiguration({ db, organizationId });
  const now = new Date();
  if (current?.mode === 'production' && current.lockedUntil !== null && current.lockedUntil > now && configuration.mode !== 'production') {
    throw createVerifactuModeLockedError();
  }
  if (configuration.mode === 'production' && ((configuration.taxId?.trim() ?? '') === '' || !configuration.certificateConfigured || !configuration.aeatValidationPassed || !configuration.responsibleDeclarationAccepted)) {
    throw createVerifactuConfigurationIncompleteError();
  }
  const firstProductionActivation = configuration.mode === 'production' && current?.mode !== 'production';
  const madridYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Madrid' }).format(now));
  const lockedUntil = firstProductionActivation ? new Date(Date.UTC(madridYear, 11, 31, 22, 59, 59, 999)) : current?.lockedUntil;
  const values = {
    mode: configuration.mode,
    applicabilityReason: configuration.applicabilityReason ?? null,
    legalName: configuration.legalName ?? null,
    taxId: configuration.taxId?.toUpperCase() ?? null,
    certificateConfigured: configuration.certificateConfigured,
    aeatValidationPassedAt: configuration.aeatValidationPassed ? current?.aeatValidationPassedAt ?? now : null,
    responsibleDeclarationAcceptedAt: configuration.responsibleDeclarationAccepted ? current?.responsibleDeclarationAcceptedAt ?? now : null,
    transmissionsPaused: configuration.transmissionsPaused,
    pauseReason: configuration.pauseReason ?? null,
    activatedAt: firstProductionActivation ? now : current?.activatedAt,
    lockedUntil,
    updatedAt: now,
  };
  const [saved] = await db.insert(verifactuConfigurationsTable).values({ organizationId, ...values }).onConflictDoUpdate({ target: verifactuConfigurationsTable.organizationId, set: values }).returning();
  return { configuration: saved! };
}

async function getRecordForInvoice({ db, organizationId, invoiceId }: { db: Database; organizationId: string; invoiceId: string }) {
  const [record] = await db.select().from(verifactuRecordsTable).where(and(eq(verifactuRecordsTable.organizationId, organizationId), eq(verifactuRecordsTable.invoiceId, invoiceId), eq(verifactuRecordsTable.recordType, 'alta'))).orderBy(desc(verifactuRecordsTable.createdAt)).limit(1);
  return { record: record ?? null };
}

async function ensureInvoiceRecord({ db, organizationId, invoiceId, now = new Date() }: { db: Database; organizationId: string; invoiceId: string; now?: Date }) {
  return db.transaction(async tx => ensureInvoiceRecordInTransaction({ db: tx as unknown as Database, organizationId, invoiceId, now }));
}

async function ensureInvoiceRecordInTransaction({ db, organizationId, invoiceId, now }: { db: Database; organizationId: string; invoiceId: string; now: Date }) {
  const { record: existing } = await getRecordForInvoice({ db, organizationId, invoiceId });
  if (existing) {
    return { record: existing };
  }
  const { configuration } = await getConfiguration({ db, organizationId });
  if (!configuration || !['test', 'production'].includes(configuration.mode)) {
    return { record: null };
  }
  const { invoice } = await createInvoicingRepository({ db }).getInvoice({ organizationId, invoiceId });
  if (!invoice) {
    throw createInvoiceNotFoundError();
  }
  const seller = parseJson<{ legalName?: string; taxId?: string }>(invoice.sellerSnapshot);
  const customer = parseJson<{ name?: string; taxId?: string | null }>(invoice.customerSnapshot);
  const issuerTaxId = configuration.taxId ?? seller.taxId ?? '';
  const issuerName = configuration.legalName ?? seller.legalName ?? '';
  if (issuerTaxId === '' || issuerName === '' || invoice.number === null) {
    throw createVerifactuConfigurationIncompleteError();
  }

  const [previous] = await db.select().from(verifactuRecordsTable).where(eq(verifactuRecordsTable.organizationId, organizationId)).orderBy(desc(verifactuRecordsTable.createdAt)).limit(1);
  const environment = configuration.mode === 'production' ? 'production' : 'test';
  const payload = {
    issuerTaxId,
    issuerName,
    invoiceNumber: invoice.number,
    issueDate: formatAeatDate(invoice.issueDate),
    invoiceType: 'F1' as const,
    customerName: customer.name ?? invoice.customer?.name ?? '',
    customerTaxId: customer.taxId ?? null,
    description: invoice.items.map(item => item.description).join('; ').slice(0, 500),
    // CuotaTotal adds the equivalence surcharge to the VAT charged
    taxAmount: formatAeatAmount(invoice.taxMinor + invoice.equivalenceSurchargeMinor),
    totalAmount: formatAeatAmount(invoice.totalMinor),
    previousHash: previous?.hash ?? '',
    generatedAt: formatAeatTimestamp(now),
  };
  const hash = calculateVerifactuHash(payload);
  const qrUrl = buildVerifactuQrUrl({ environment, issuerTaxId, invoiceNumber: invoice.number, issueDate: payload.issueDate, totalAmount: payload.totalAmount });
  const xmlPayload = buildVerifactuXml(payload, hash);
  await db.insert(verifactuRecordsTable).values({
    organizationId,
    invoiceId,
    idempotencyKey: `${invoiceId}:alta`,
    createdAt: now,
    recordType: 'alta',
    invoiceType: 'F1',
    status: 'pending',
    previousRecordId: previous?.id ?? null,
    previousHash: previous?.hash ?? null,
    hash,
    generatedAt: now,
    payload: JSON.stringify(payload),
    xmlPayload,
    qrUrl,
    nextAttemptAt: now,
  }).onConflictDoNothing();
  return getRecordForInvoice({ db, organizationId, invoiceId });
}

async function listRecords({ db, organizationId }: { db: Database; organizationId?: string }) {
  const records = await db.select().from(verifactuRecordsTable).where(organizationId === undefined ? undefined : eq(verifactuRecordsTable.organizationId, organizationId)).orderBy(desc(verifactuRecordsTable.createdAt)).limit(200);
  return { records };
}

async function getSystemState({ db }: { db: Database }) {
  await db.insert(verifactuSystemStateTable).values({ id: 'global', dispatchPaused: false }).onConflictDoNothing();
  const [state] = await db.select().from(verifactuSystemStateTable).where(eq(verifactuSystemStateTable.id, 'global')).limit(1);
  return { state: state! };
}

async function updateSystemState({ db, state }: { db: Database; state: SystemStateInput }) {
  const [saved] = await db.insert(verifactuSystemStateTable).values({ id: 'global', ...state }).onConflictDoUpdate({ target: verifactuSystemStateTable.id, set: { ...state, updatedAt: new Date() } }).returning();
  return { state: saved! };
}

async function getDashboard({ db }: { db: Database }) {
  const [counts] = await db.select({
    pending: sql<number>`COUNT(*) FILTER (WHERE ${verifactuRecordsTable.status} IN ('pending', 'retrying'))`.mapWith(Number),
    rejected: sql<number>`COUNT(*) FILTER (WHERE ${verifactuRecordsTable.status} = 'rejected')`.mapWith(Number),
    accepted: sql<number>`COUNT(*) FILTER (WHERE ${verifactuRecordsTable.status} IN ('accepted', 'accepted_with_errors'))`.mapWith(Number),
    total: sql<number>`COUNT(*)`.mapWith(Number),
  }).from(verifactuRecordsTable);
  const { state } = await getSystemState({ db });
  const configurations = await db.select().from(verifactuConfigurationsTable).where(inArray(verifactuConfigurationsTable.mode, ['test', 'production']));
  return { state, counts: counts!, activeOrganizations: configurations.length };
}

function parseJson<T>(value: string | null): T {
  if (value === null || value === '') {
    return {} as T;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}
