import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PaquiApiClient } from '../api.js';
import type { PaquiMcpServerOptions } from '../server.js';

export interface ToolServer {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    handler: (input: any) => Promise<CallToolResult>,
  ) => unknown;
}

export interface ToolRegistrationContext {
  server: ToolServer;
  client: PaquiApiClient;
  options: PaquiMcpServerOptions;
}

export type ToolRegistrar = (context: ToolRegistrationContext) => void;
