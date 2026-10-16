import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RestPaquiApiClient } from './api.js';
import { createPaquiMcpServer } from './server.js';

const apiUrl = process.env.PAPRA_API_URL ?? 'https://api.heypaqui.com';
const apiKey = process.env.PAPRA_API_KEY;

if (!apiKey) {
  process.stderr.write('PAPRA_API_KEY is required\n');
  process.exit(1);
}

const client = new RestPaquiApiClient({ apiUrl, apiKey });
const server = createPaquiMcpServer(client, {
  enableLocalFileTools: true,
  serverName: process.env.MCP_SERVER_NAME,
});
const transport = new StdioServerTransport();

await server.connect(transport);
