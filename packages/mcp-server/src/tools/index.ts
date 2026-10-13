import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PapraApiClient } from '../api.js';
import type { PapraMcpServerOptions } from '../server.js';
import type { ToolRegistrar, ToolServer } from './types.js';
import { registerDocumentTools } from './documents.js';
import { registerOrganizationTools } from './organizations.js';
import { registerSystemTools } from './system.js';
import { registerTagTools } from './tags.js';

const toolModules: ToolRegistrar[] = [
  registerSystemTools,
  registerOrganizationTools,
  registerDocumentTools,
  registerTagTools,
];

export function registerTools(
  server: McpServer,
  client: PapraApiClient,
  options: PapraMcpServerOptions,
): void {
  // The SDK's registerTool type recursively expands each Zod schema and can
  // exceed TypeScript's instantiation limit in larger registries. The module
  // boundary stays intentionally shallow while MCP performs runtime validation.
  const toolServer = server as unknown as ToolServer;
  for (const registerToolModule of toolModules) {
    registerToolModule({ server: toolServer, client, options });
  }
}
