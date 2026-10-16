import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpHttpConfig } from '../src/config.js';
import type { Logger } from '../src/observability/logger.js';
import { createHttpApp } from '../src/transport/http.js';

const silentLogger: Logger = {
  info() {},
  error() {},
};

test('health is public while MCP requires Bearer authentication', async (t) => {
  const { server, baseUrl } = await listenApp(baseConfig());
  t.after(() => closeServer(server));

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: 'ok',
    service: 'paqui-mcp',
    transport: 'streamable-http',
  });

  const unauthorized = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get('www-authenticate') ?? '', /^Bearer/);
});

test('rejects browser origins that are not allowlisted', async (t) => {
  const { server, baseUrl } = await listenApp(baseConfig());
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ppapi_test',
      'content-type': 'application/json',
      origin: 'https://attacker.example',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  assert.equal(response.status, 403);
});

test('serves the modular tools over stateless HTTP with request-scoped auth', async (t) => {
  let forwardedAuthorization: string | undefined;
  let forwardedRequestId: string | undefined;
  const upstream = createServer((req, res) => {
    forwardedAuthorization = req.headers.authorization;
    forwardedRequestId = req.headers['x-request-id'] as string | undefined;
    res.setHeader('content-type', 'application/json');

    if (req.url === '/api/api-keys/current') {
      res.end(JSON.stringify({
        apiKey: {
          id: 'api-key-1',
          name: 'MCP test',
          permissions: ['organizations:read', 'documents:read', 'tags:read'],
        },
      }));
      return;
    }

    if (req.url === '/api/organizations') {
      res.end(JSON.stringify({ organizations: [{ id: 'org-1', name: 'Test' }] }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  const upstreamUrl = await listen(upstream);
  t.after(() => closeServer(upstream));

  const { server, baseUrl } = await listenApp({ ...baseConfig(), apiUrl: upstreamUrl });
  t.after(() => closeServer(server));

  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { authorization: 'Bearer ppapi_test' } },
  });
  const client = new Client({ name: 'paqui-test', version: '1.0.0' });
  t.after(() => client.close());

  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map(tool => tool.name);

  assert.ok(toolNames.includes('list_organizations'));
  assert.ok(toolNames.includes('list_documents'));
  assert.ok(toolNames.includes('create_tag'));
  assert.ok(!toolNames.includes('upload_document'));
  assert.equal(tools.tools.find(tool => tool.name === 'list_documents')?.annotations?.readOnlyHint, true);
  assert.equal(tools.tools.find(tool => tool.name === 'remove_tag_from_document')?.annotations?.destructiveHint, true);

  const result = await client.callTool({ name: 'list_organizations', arguments: {} });
  assert.equal(result.isError, undefined);
  assert.equal(forwardedAuthorization, 'Bearer ppapi_test');
  assert.ok(forwardedRequestId);
});

function baseConfig(): McpHttpConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    apiUrl: 'https://paqui.invalid',
    apiTimeoutMs: 1_000,
    serverName: 'paqui-test',
    allowedHosts: ['127.0.0.1'],
    allowedOrigins: new Set(),
  };
}

async function listenApp(config: McpHttpConfig) {
  const server = createHttpApp(config, silentLogger).listen(0, '127.0.0.1');
  return { server, baseUrl: await listeningUrl(server) };
}

async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1');
  return listeningUrl(server);
}

async function listeningUrl(server: Server): Promise<string> {
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an IPv4 server address');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
