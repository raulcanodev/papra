import type { ToolRegistrar } from './types.js';
import { runTool } from './shared.js';

export const registerSystemTools: ToolRegistrar = ({ server, client }) => {
  server.registerTool('get_connection_context', {
    title: 'Get Papra connection context',
    description: 'Verify the configured Papra API key and return its name and permissions.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => runTool(async () => ({ apiKey: await client.authenticate() })));
};
