import type { PapraApiClient } from './api.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/index.js';

export interface PapraMcpServerOptions {
  enableLocalFileTools?: boolean;
  serverName?: string;
}

export function createPapraMcpServer(
  client: PapraApiClient,
  options: PapraMcpServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: options.serverName ?? 'papra',
    version: '0.1.0',
  }, {
    instructions: [
      'Use list_organizations before organization-scoped tools when the target is ambiguous.',
      'Use identifiers returned by Papra instead of guessing them.',
      'Read current data before changing it.',
      'Ask for confirmation before uploads, edits, removals, or other write operations.',
    ].join(' '),
  });

  registerTools(server, client, options);
  return server;
}
