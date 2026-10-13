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
