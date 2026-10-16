import type { PaquiApiClient } from './api.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/index.js';

export interface PaquiMcpServerOptions {
  enableLocalFileTools?: boolean;
  serverName?: string;
}

export function createPaquiMcpServer(
  client: PaquiApiClient,
  options: PaquiMcpServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: options.serverName ?? 'paqui',
    version: '0.1.0',
  }, {
    instructions: [
      'Use list_organizations before organization-scoped tools when the target is ambiguous.',
      'Use search_workspace to turn names the user mentions (a customer, a supplier, an invoice number) into IDs; never guess identifiers.',
      'Read current data before changing it.',
      'Ask for confirmation before uploads, edits, removals, issuing or emailing invoices, or other write operations.',
      'For Spanish tax or invoicing questions call get_spanish_tax_reference first, then verify rates, thresholds and deadlines on official sources (AEAT, BOE, Seguridad Social) and get_calendar for current deadlines.',
    ].join(' '),
  });

  registerTools(server, client, options);
  return server;
}
