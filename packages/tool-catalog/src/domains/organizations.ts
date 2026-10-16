import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath } from '../request';
import { defineGlobalTool, defineOrganizationTool } from '../tool-definition';

export const organizationTools = [
  defineGlobalTool({
    name: 'list_organizations',
    title: 'List organizations',
    description: 'List the Paqui organizations (workspaces) accessible to the current user or API key.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.ORGANIZATIONS.READ,
    run: (_input, { api }) => api.request('GET', '/api/organizations'),
  }),
  defineOrganizationTool({
    name: 'get_organization',
    title: 'Get organization',
    description: 'Get the current organization: name and metadata.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.ORGANIZATIONS.READ,
    run: (_input, { api, organizationId }) => api.request('GET', organizationPath(organizationId)),
  }),
];
