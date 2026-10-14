import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { PapraApiClient } from '../src/api.js';
import { createPapraMcpServer } from '../src/server.js';

const fakeClient: PapraApiClient = {
  async authenticate() {
    return { id: 'key-1', name: 'Test', permissions: [] };
  },
  async request() {
    return {};
  },
  async requestForm() {
    return {};
  },
};

test('local and remote factories expose the correct tool surface', async (t) => {
  const [localClientTransport, localServerTransport] = InMemoryTransport.createLinkedPair();
  const localServer = createPapraMcpServer(fakeClient, { enableLocalFileTools: true });
  const localClient = new Client({ name: 'local-test', version: '1.0.0' });
  t.after(() => Promise.all([localClient.close(), localServer.close()]));
  await localServer.connect(localServerTransport);
  await localClient.connect(localClientTransport);

  const localTools = await localClient.listTools();
  assert.ok(localTools.tools.some(tool => tool.name === 'upload_document'));

  const [remoteClientTransport, remoteServerTransport] = InMemoryTransport.createLinkedPair();
  const remoteServer = createPapraMcpServer(fakeClient, { enableLocalFileTools: false });
  const remoteClient = new Client({ name: 'remote-test', version: '1.0.0' });
  t.after(() => Promise.all([remoteClient.close(), remoteServer.close()]));
  await remoteServer.connect(remoteServerTransport);
  await remoteClient.connect(remoteClientTransport);

  const remoteTools = await remoteClient.listTools();
  assert.ok(!remoteTools.tools.some(tool => tool.name === 'upload_document'));
  assert.ok(remoteTools.tools.some(tool => tool.name === 'list_organizations'));
});

test('catalog tools are exposed with the organization argument, risk annotations and permissions', async (t) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const calls: Array<{ method: string; path: string }> = [];
  const server = createPapraMcpServer({
    ...fakeClient,
    async request(method, path) {
      calls.push({ method, path });
      return { contacts: [] } as never;
    },
  });
  const client = new Client({ name: 'catalog-test', version: '1.0.0' });
  t.after(() => Promise.all([client.close(), server.close()]));
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const byName = new Map(tools.map(tool => [tool.name, tool]));

  for (const name of ['search_workspace', 'create_invoice_draft', 'delete_contact', 'get_quarterly_taxes', 'get_calendar']) {
    assert.ok(byName.has(name), `${name} is exposed`);
    assert.ok(Object.keys(byName.get(name)?.inputSchema.properties ?? {}).includes('organizationId'), `${name} takes the organization`);
  }

  assert.equal(byName.get('list_contacts')?.annotations?.readOnlyHint, true);
  assert.equal(byName.get('delete_contact')?.annotations?.destructiveHint, true);
  assert.ok(!Object.keys(byName.get('get_spanish_tax_reference')?.inputSchema.properties ?? {}).includes('organizationId'));

  await client.callTool({ name: 'list_contacts', arguments: { organizationId: 'org_1', role: 'supplier' } });
  assert.deepEqual(calls.at(-1), { method: 'GET', path: '/api/organizations/org_1/contacts?role=supplier' });
});
