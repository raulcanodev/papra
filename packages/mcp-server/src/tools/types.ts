import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PapraApiClient } from '../api.js';
import type { PapraMcpServerOptions } from '../server.js';

export interface ToolServer {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    handler: (input: any) => Promise<CallToolResult>,
  ) => unknown;
}

export interface ToolRegistrationContext {
  server: ToolServer;
  client: PapraApiClient;
  options: PapraMcpServerOptions;
}

export type ToolRegistrar = (context: ToolRegistrationContext) => void;
