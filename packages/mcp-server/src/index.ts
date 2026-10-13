import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RestPapraApiClient } from './api.js';
import { createPapraMcpServer } from './server.js';

const apiUrl = process.env.PAPRA_API_URL ?? 'https://api.papra.app';
const apiKey = process.env.PAPRA_API_KEY;

if (!apiKey) {
  process.stderr.write('PAPRA_API_KEY is required\n');
  process.exit(1);
}

const client = new RestPapraApiClient({ apiUrl, apiKey });
const server = createPapraMcpServer(client, {
  enableLocalFileTools: true,
  serverName: process.env.MCP_SERVER_NAME,
});
const transport = new StdioServerTransport();

await server.connect(transport);
