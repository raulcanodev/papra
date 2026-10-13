import { z } from 'zod';
import type { ToolRegistrar } from './types.js';
import { apiPathSegment, runTool } from './shared.js';

export const registerOrganizationTools: ToolRegistrar = ({ server, client }) => {
  server.registerTool('list_organizations', {
    title: 'List organizations',
    description: 'List the Papra organizations accessible to the current API key.',
    annotations: readOnlyAnnotations,
  }, async () => runTool(() => client.request('GET', '/api/organizations')));

  server.registerTool('get_organization', {
    title: 'Get organization',
    description: 'Get one Papra organization by ID.',
    inputSchema: {
      organizationId: z.string().min(1).describe('Papra organization ID'),
    },
    annotations: readOnlyAnnotations,
  }, async ({ organizationId }) => runTool(() => client.request(
    'GET',
    `/api/organizations/${apiPathSegment(organizationId)}`,
  )));
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
