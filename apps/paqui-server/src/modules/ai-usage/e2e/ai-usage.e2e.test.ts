import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { getAiModelSelection } from '../../ai-assistant/ai-assistant.providers';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';
import { createAiUsageContextMiddleware, getRequestAiUsageContext } from '../ai-usage.context';
import { createAiUsageRepository } from '../ai-usage.repository';

const ADMIN_ID = 'usr_111111111111111111111111';
const MEMBER_ID = 'usr_222222222222222222222222';
const ORG_ID = 'org_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

async function setup({ aiAssistant = { anthropicApiKey: 'sk-ant-test', grokApiKey: 'xai-test' } }: { aiAssistant?: Record<string, string> } = {}) {
  const { db } = await createInMemoryDatabase({
    users: [{ id: ADMIN_ID, email: 'admin@example.com', name: 'Ada Admin' }, { id: MEMBER_ID, email: 'member@example.com', name: 'Mario Member' }],
    organizations: [{ id: ORG_ID, name: 'Acme SL' }, { id: OTHER_ORG_ID, name: 'Beta SL' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: ADMIN_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: ORG_ID, userId: MEMBER_ID, role: ORGANIZATION_ROLES.MEMBER },
    ],
    userRoles: [{ userId: ADMIN_ID, role: 'admin' }],
  });
  const config = overrideConfig({ env: 'test', aiAssistant });
  const { app } = createServer(createTestServerDependencies({ db, config }));
  const request = async (path: string, init: RequestInit = {}, userId = ADMIN_ID) => app.request(path, { headers: { 'Content-Type': 'application/json' }, ...init }, { loggedInUserId: userId });

  return { db, config, request };
}

const usageRow = (overrides: Record<string, unknown>) => ({ feature: 'assistant_chat', provider: 'anthropic', model: 'claude-haiku-5-5', inputTokens: 1_000, outputTokens: 100, costUsdMicros: 150, createdAt: new Date('2026-10-10T10:00:00Z'), ...overrides });

describe('ai usage e2e', () => {
  test('the usage is broken down by feature, then by workspace of a feature, then by member of a workspace', async () => {
    const { db, request } = await setup();
    const repository = createAiUsageRepository({ db });
    for (const usage of [
      usageRow({ organizationId: ORG_ID, userId: ADMIN_ID }),
      usageRow({ organizationId: ORG_ID, userId: MEMBER_ID, costUsdMicros: 300 }),
      usageRow({ organizationId: OTHER_ORG_ID, userId: null }),
      usageRow({ feature: 'purchase_reading', organizationId: ORG_ID, userId: null, costUsdMicros: 1_000 }),
      // Outside the period
      usageRow({ organizationId: ORG_ID, userId: ADMIN_ID, createdAt: new Date('2026-08-01T10:00:00Z') }),
    ]) {
      await repository.recordUsage({ usage });
    }

    const get = async (query: string) => (await (await request(`/api/admin/ai/usage?from=2026-10-01&to=2026-11-01${query}`)).json()) as { rows: Array<{ key: string | null; label: string | null; calls: number; costUsdMicros: number }>; providers: Array<{ provider: string; costUsdMicros: number }> };

    const byFeature = await get('');
    expect(byFeature.rows.map(({ key, calls, costUsdMicros }) => [key, calls, costUsdMicros])).to.eql([['purchase_reading', 1, 1_000], ['assistant_chat', 3, 600]]);
    expect(byFeature.providers.map(({ provider, costUsdMicros }) => [provider, costUsdMicros])).to.eql([['anthropic', 1_600], ['openai', 0], ['google', 0], ['xai', 0]]);

    const byWorkspace = await get('&groupBy=organization&feature=assistant_chat');
    expect(byWorkspace.rows.map(({ label, calls }) => [label, calls])).to.eql([['Acme SL', 2], ['Beta SL', 1]]);

    const byMember = await get(`&groupBy=user&feature=assistant_chat&organizationId=${ORG_ID}`);
    expect(byMember.rows.map(({ label, costUsdMicros }) => [label, costUsdMicros])).to.eql([['Mario Member', 300], ['Ada Admin', 150]]);
  });

  test('the model chosen in the admin panel applies to every AI feature, with its reasoning effort', async () => {
    const { db, config, request } = await setup();

    // Nothing chosen and only API keys set: Claude Haiku 5.5 with a high effort when Anthropic has a key
    expect(await getAiModelSelection({ config, db })).to.eql({ provider: 'anthropic', model: 'claude-haiku-5-5', reasoningEffort: 'high' });

    const response = await request('/api/admin/ai/settings', { method: 'PUT', body: JSON.stringify({ model: 'grok-4-1-fast-non-reasoning', reasoningEffort: null }) });
    const body = await response.json() as { current: unknown; source: string };

    expect(body.current).to.eql({ provider: 'xai', model: 'grok-4-1-fast-non-reasoning', reasoningEffort: null });
    expect(body.source).to.eql('admin');
    expect(await getAiModelSelection({ config, db })).to.eql({ provider: 'xai', model: 'grok-4-1-fast-non-reasoning', reasoningEffort: null });
  });

  test('a model whose provider has no API key cannot be chosen, and only admins see or change the AI settings', async () => {
    const { request } = await setup({ aiAssistant: { grokApiKey: 'xai-test' } });

    expect((await request('/api/admin/ai/settings', { method: 'PUT', body: JSON.stringify({ model: 'claude-haiku-5-5', reasoningEffort: null }) })).status).to.eql(400);
    expect((await request('/api/admin/ai/settings', {}, MEMBER_ID)).status).to.eql(401);
    expect((await request('/api/admin/ai/usage?from=2026-10-01&to=2026-11-01', {}, MEMBER_ID)).status).to.eql(401);
  });

  test('an AI call made during a request is attributed to the workspace of the route and the authenticated member', async () => {
    const app = new Hono<{ Variables: { userId: string } }>();
    app.use(createAiUsageContextMiddleware() as never);
    app.use(async (context, next) => {
      context.set('userId', MEMBER_ID);
      await next();
    });
    app.get('/api/organizations/:organizationId/anything', async context => context.json(getRequestAiUsageContext()));

    const response = await app.request(`/api/organizations/${ORG_ID}/anything`);

    expect(await response.json()).to.eql({ organizationId: ORG_ID, userId: MEMBER_ID });
    expect(getRequestAiUsageContext()).to.eql({ organizationId: null, userId: null });
  });
});
