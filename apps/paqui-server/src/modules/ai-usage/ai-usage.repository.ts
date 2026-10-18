import type { Database } from '../app/database/database.types';
import type { AiReasoningEffort } from './ai-usage.constants';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { organizationsTable } from '../organizations/organizations.table';
import { usersTable } from '../users/users.table';
import { AI_SETTINGS_CACHE_TTL_MS, AI_SETTINGS_ID } from './ai-usage.constants';
import { aiSettingsTable, aiUsageTable } from './ai-usage.table';

export type AiUsageRecord = typeof aiUsageTable.$inferInsert;
export type AiSettings = { provider: string; model: string; reasoningEffort: AiReasoningEffort | null };
export type AiUsageGroupBy = 'feature' | 'organization' | 'user';

export function createAiUsageRepository({ db }: { db: Database }) {
  return {
    recordUsage: async (args: { usage: AiUsageRecord }) => recordUsage({ db, ...args }),
    getSettings: async () => getSettings({ db }),
    saveSettings: async (args: { settings: AiSettings; userId: string }) => saveSettings({ db, ...args }),
    getUsageBreakdown: async (args: { from: Date; to: Date; groupBy: AiUsageGroupBy; feature?: string; organizationId?: string }) => getUsageBreakdown({ db, ...args }),
    getProviderTotals: async (args: { from: Date; to: Date }) => getProviderTotals({ db, ...args }),
  };
}

async function recordUsage({ db, usage }: { db: Database; usage: AiUsageRecord }) {
  await db.insert(aiUsageTable).values(usage);
}

// Read before every AI call: cached per database for a few seconds instead of one query per call
const settingsCache = new WeakMap<Database, { settings: AiSettings | null; expiresAt: number }>();

async function getSettings({ db }: { db: Database }) {
  const cached = settingsCache.get(db);
  if (cached && cached.expiresAt > Date.now()) {
    return { settings: cached.settings };
  }

  const [row] = await db.select().from(aiSettingsTable).where(eq(aiSettingsTable.id, AI_SETTINGS_ID)).limit(1);
  const settings = row ? { provider: row.provider, model: row.model, reasoningEffort: row.reasoningEffort as AiReasoningEffort | null } : null;
  settingsCache.set(db, { settings, expiresAt: Date.now() + AI_SETTINGS_CACHE_TTL_MS });

  return { settings };
}

async function saveSettings({ db, settings, userId }: { db: Database; settings: AiSettings; userId: string }) {
  await db.insert(aiSettingsTable)
    .values({ id: AI_SETTINGS_ID, ...settings, updatedBy: userId })
    .onConflictDoUpdate({ target: aiSettingsTable.id, set: { ...settings, updatedBy: userId, updatedAt: new Date() } });
  settingsCache.delete(db);

  return getSettings({ db });
}

const totals = {
  calls: sql<number>`count(*)::int`,
  errors: sql<number>`count(*) filter (where ${aiUsageTable.status} = 'error')::int`,
  inputTokens: sql<number>`coalesce(sum(${aiUsageTable.inputTokens} + ${aiUsageTable.cacheReadTokens} + ${aiUsageTable.cacheWriteTokens}), 0)::bigint`,
  outputTokens: sql<number>`coalesce(sum(${aiUsageTable.outputTokens}), 0)::bigint`,
  costUsdMicros: sql<number>`coalesce(sum(${aiUsageTable.costUsdMicros}), 0)::bigint`,
  // Calls of a model without a known price: their cost is missing from the total
  unpricedCalls: sql<number>`count(*) filter (where ${aiUsageTable.costUsdMicros} is null)::int`,
};

function toNumbers<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    calls: Number(row.calls),
    errors: Number(row.errors),
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    costUsdMicros: Number(row.costUsdMicros),
    unpricedCalls: Number(row.unpricedCalls),
  };
}

// The usage in a period, by feature, by workspace (of a feature) or by member (of a workspace, for a feature)
async function getUsageBreakdown({ db, from, to, groupBy, feature, organizationId }: { db: Database; from: Date; to: Date; groupBy: AiUsageGroupBy; feature?: string; organizationId?: string }) {
  const where = and(
    gte(aiUsageTable.createdAt, from),
    lt(aiUsageTable.createdAt, to),
    feature === undefined ? undefined : eq(aiUsageTable.feature, feature),
    organizationId === undefined ? undefined : eq(aiUsageTable.organizationId, organizationId),
  );

  if (groupBy === 'feature') {
    const rows = await db.select({ key: aiUsageTable.feature, ...totals }).from(aiUsageTable).where(where).groupBy(aiUsageTable.feature).orderBy(desc(totals.costUsdMicros), asc(aiUsageTable.feature));
    return { rows: rows.map(row => toNumbers({ ...row, label: row.key })) };
  }

  if (groupBy === 'organization') {
    const rows = await db
      .select({ key: aiUsageTable.organizationId, label: organizationsTable.name, ...totals })
      .from(aiUsageTable)
      .leftJoin(organizationsTable, eq(aiUsageTable.organizationId, organizationsTable.id))
      .where(where)
      .groupBy(aiUsageTable.organizationId, organizationsTable.name)
      .orderBy(desc(totals.costUsdMicros));
    return { rows: rows.map(row => toNumbers(row)) };
  }

  const rows = await db
    .select({ key: aiUsageTable.userId, label: usersTable.name, email: usersTable.email, ...totals })
    .from(aiUsageTable)
    .leftJoin(usersTable, eq(aiUsageTable.userId, usersTable.id))
    .where(where)
    .groupBy(aiUsageTable.userId, usersTable.name, usersTable.email)
    .orderBy(desc(totals.costUsdMicros));
  return { rows: rows.map(row => toNumbers(row)) };
}

// What each provider will charge for the period, with the models used
async function getProviderTotals({ db, from, to }: { db: Database; from: Date; to: Date }) {
  const rows = await db
    .select({ provider: aiUsageTable.provider, model: aiUsageTable.model, ...totals })
    .from(aiUsageTable)
    .where(and(gte(aiUsageTable.createdAt, from), lt(aiUsageTable.createdAt, to)))
    .groupBy(aiUsageTable.provider, aiUsageTable.model);

  return { rows: rows.map(row => toNumbers(row)) };
}
