import { randomUUID } from 'node:crypto';
import type { ApiKeyContext } from '@paqui/mcp-server/api';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createPaquiMcpServer } from '@paqui/mcp-server';
import { PaquiApiError, RestPaquiApiClient } from '@paqui/mcp-server/api';
import type { McpHttpConfig } from '../config.js';
import { bearerChallenge, readBearerToken } from '../authentication/bearer.js';
import { logger as defaultLogger } from '../observability/logger.js';
import type { Logger } from '../observability/logger.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MCP_ENDPOINTS = ['/', '/mcp'];

export function createHttpApp(
  config: McpHttpConfig,
  log: Logger = defaultLogger,
): ReturnType<typeof createMcpExpressApp> {
  const app = createMcpExpressApp({
    host: config.host,
    allowedHosts: config.allowedHosts,
  });

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const inboundRequestId = req.header('x-request-id');
    const requestId = inboundRequestId && REQUEST_ID_PATTERN.test(inboundRequestId)
      ? inboundRequestId
      : randomUUID();
    const startedAt = performance.now();

    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    res.once('finish', () => {
      const apiKey = res.locals.apiKey as ApiKeyContext | undefined;
      log.info('http_request', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        apiKeyId: apiKey?.id,
        ...describeMcpOperation(req.body),
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'paqui-mcp',
      transport: 'streamable-http',
    });
  });

  app.all(MCP_ENDPOINTS, async (req, res, next) => {
    const origin = req.header('origin');
    if (origin && !config.allowedOrigins.has(origin)) {
      res.status(403).json(jsonRpcError('Origin is not allowed'));
      return;
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, x-request-id');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, x-request-id',
      );
      res.status(204).end();
      return;
    }

    const apiKey = readBearerToken(req.header('authorization'));
    if (!apiKey) {
      res.setHeader('WWW-Authenticate', bearerChallenge());
      res.status(401).json(jsonRpcError('Bearer authentication is required'));
      return;
    }

    const client = new RestPaquiApiClient({
      apiUrl: config.apiUrl,
      apiKey,
      requestId: res.locals.requestId as string,
      timeoutMs: config.apiTimeoutMs,
    });

    try {
      res.locals.apiKey = await client.authenticate();
    }
    catch (error) {
      const upstreamStatus = error instanceof PaquiApiError ? error.status : undefined;
      const statusCode = upstreamStatus === 401
        ? 401
        : upstreamStatus === 403
          ? 403
          : upstreamStatus === 429
            ? 429
            : 503;

      log.info('authentication_failed', {
        requestId: res.locals.requestId,
        statusCode,
        upstreamStatus,
        reason: describeAuthenticationFailure(error),
      });

      if (statusCode === 401) {
        res.setHeader('WWW-Authenticate', bearerChallenge('invalid_token'));
      }

      res.status(statusCode).json(jsonRpcError(
        statusCode === 401
          ? 'Paqui API key is invalid or expired'
          : statusCode === 403
            ? 'Paqui API key is not allowed to access this resource'
            : 'Authentication service is unavailable',
      ));
      return;
    }

    res.locals.apiClient = client;
    next();
  });

  app.post(MCP_ENDPOINTS, async (req, res) => {
    const requestId = res.locals.requestId as string;
    const client = res.locals.apiClient as RestPaquiApiClient;
    const server = createPaquiMcpServer(client, {
      enableLocalFileTools: false,
      serverName: config.serverName,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    const close = () => {
      void transport.close();
      void server.close();
    };
    res.once('close', close);

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }
    catch (error) {
      log.error('mcp_request_failed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json(jsonRpcError('Internal MCP server error', -32603));
      }
    }
  });

  app.get(MCP_ENDPOINTS, (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json(jsonRpcError('Method not allowed'));
  });

  app.delete(MCP_ENDPOINTS, (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json(jsonRpcError('Method not allowed'));
  });

  return app;
}

function describeAuthenticationFailure(error: unknown): string {
  if (error instanceof PaquiApiError) {
    if (error.status === 401) return 'credential_rejected';
    if (error.status === 429) return 'upstream_rate_limited';
    return `upstream_http_${error.status}`;
  }
  return 'unexpected_error';
}

function jsonRpcError(message: string, code = -32000) {
  return {
    jsonrpc: '2.0' as const,
    error: { code, message },
    id: null,
  };
}

function describeMcpOperation(body: unknown): Record<string, string> {
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    return {};
  }

  const message = body as { method?: unknown; params?: { name?: unknown } };
  const fields: Record<string, string> = {};
  if (typeof message.method === 'string') {
    fields.mcpMethod = message.method;
  }
  if (message.method === 'tools/call' && typeof message.params?.name === 'string') {
    fields.toolName = message.params.name;
  }
  return fields;
}
