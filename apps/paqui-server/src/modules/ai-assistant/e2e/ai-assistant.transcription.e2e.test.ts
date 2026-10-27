import { afterEach, describe, expect, test, vi } from 'vitest';
import { aiUsageTable } from '../../ai-usage/ai-usage.table';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const OUTSIDER_ID = 'usr_222222222222222222222222';
const ORG_ID = 'org_333333333333333333333333';

async function setup({ aiAssistant = { openaiApiKey: 'sk-test' } }: { aiAssistant?: Record<string, string> } = {}) {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com', name: 'Ana' }, { id: OUTSIDER_ID, email: 'outsider@example.com', name: 'Otto' }],
    organizations: [{ id: ORG_ID, name: 'Acme SL' }],
    organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
  });
  const config = overrideConfig({ env: 'test', aiAssistant });
  const { app } = createServer(createTestServerDependencies({ db, config }));

  const transcribe = async ({ userId = USER_ID, language = 'es' }: { userId?: string; language?: string } = {}) => {
    const body = new FormData();
    body.set('file', new File([new Uint8Array([1, 2, 3])], 'dictation.webm', { type: 'audio/webm' }));
    return app.request(`/api/organizations/${ORG_ID}/ai/transcriptions?language=${language}`, { method: 'POST', body }, { loggedInUserId: userId });
  };

  return { db, transcribe };
}

function mockOpenAi(response: Response) {
  const calls: FormData[] = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) !== 'https://api.openai.com/v1/audio/transcriptions') {
      return realFetch(url, init);
    }
    calls.push(init?.body as FormData);
    return response;
  });
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ai assistant transcription e2e', () => {
  test('a dictated message is transcribed in the language of the user, with the vocabulary of the app, and its cost recorded', async () => {
    const { db, transcribe } = await setup();
    const { calls } = mockOpenAi(Response.json({
      text: ' ¿Cuánto me deben los clientes? ',
      usage: { type: 'tokens', input_tokens: 1_000, output_tokens: 20, input_token_details: { audio_tokens: 950, text_tokens: 50 } },
    }));

    const response = await transcribe();

    expect(response.status).to.eql(200);
    expect(await response.json()).to.eql({ text: '¿Cuánto me deben los clientes?' });
    expect(calls[0]?.get('model')).to.eql('gpt-4o-transcribe');
    expect(calls[0]?.get('language')).to.eql('es');
    expect(calls[0]?.get('prompt')).to.include('albarán');

    await vi.waitFor(async () => {
      const rows = await db.select().from(aiUsageTable);
      expect(rows).toMatchObject([{ feature: 'voice_dictation', provider: 'openai', model: 'gpt-4o-transcribe', organizationId: ORG_ID, userId: USER_ID, inputTokens: 1_000, outputTokens: 20, costUsdMicros: 950 * 6 + 50 * 2.5 + 20 * 10, status: 'success' }]);
    });
  });

  test('only members of the workspace can dictate', async () => {
    const { transcribe } = await setup();
    mockOpenAi(Response.json({ text: 'hola' }));

    expect((await transcribe({ userId: OUTSIDER_ID })).status).to.not.eql(200);
  });

  test('without an OpenAI key there is no transcription', async () => {
    const { transcribe } = await setup({ aiAssistant: { anthropicApiKey: 'sk-ant-test' } });

    expect((await transcribe()).status).to.eql(503);
  });

  test('a failure of the provider is reported and recorded as an error', async () => {
    const { db, transcribe } = await setup();
    mockOpenAi(new Response('boom', { status: 500 }));

    expect((await transcribe()).status).to.eql(502);
    await vi.waitFor(async () => {
      expect(await db.select().from(aiUsageTable)).toMatchObject([{ feature: 'voice_dictation', status: 'error', costUsdMicros: null }]);
    });
  });
});
