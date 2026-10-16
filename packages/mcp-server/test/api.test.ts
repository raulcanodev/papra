import assert from 'node:assert/strict';
import test from 'node:test';
import { PaquiApiError, RestPaquiApiClient, safePath } from '../src/api.js';

test('RestPaquiApiClient forwards bearer auth and request IDs', async () => {
  let receivedUrl = '';
  let receivedHeaders: Headers | undefined;
  const client = new RestPaquiApiClient({
    apiUrl: 'https://paqui.invalid/',
    apiKey: 'ppapi_test',
    requestId: 'request-123',
    fetchFn: async (input, init) => {
      receivedUrl = String(input);
      receivedHeaders = new Headers(init?.headers);
      return Response.json({ organizations: [] });
    },
  });

  await client.request('GET', '/api/organizations');

  assert.equal(receivedUrl, 'https://paqui.invalid/api/organizations');
  assert.equal(receivedHeaders?.get('authorization'), 'Bearer ppapi_test');
  assert.equal(receivedHeaders?.get('x-request-id'), 'request-123');
  assert.equal(receivedHeaders?.get('x-paqui-source'), 'mcp');
});

test('RestPaquiApiClient maps upstream failures to PaquiApiError', async () => {
  const client = new RestPaquiApiClient({
    apiUrl: 'https://paqui.invalid',
    apiKey: 'bad-key',
    fetchFn: async () => Response.json({ error: { message: 'Invalid API key' } }, { status: 401 }),
  });

  await assert.rejects(
    () => client.authenticate(),
    (error: unknown) => error instanceof PaquiApiError
      && error.status === 401
      && error.message === 'Invalid API key',
  );
});

test('safePath prevents absolute URLs from bypassing the configured API', () => {
  assert.equal(safePath('/api/organizations'), '/api/organizations');
  assert.throws(() => safePath('https://attacker.example/api'));
  assert.throws(() => safePath('//attacker.example/api'));
});
