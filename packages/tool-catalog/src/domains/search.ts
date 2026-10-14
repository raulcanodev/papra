import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, withQuery } from '../request';
import { defineOrganizationTool } from '../tool-definition';

export const SEARCH_KINDS = ['contact', 'invoice', 'purchase_invoice', 'product', 'document'] as const;

export const searchTools = [
  defineOrganizationTool({
    name: 'search_workspace',
    title: 'Search the workspace',
    description: 'Deep search across the whole workspace at once: contacts (by name, tax ID, email, city, notes), issued invoices (number, customer, notes, line descriptions), received invoices (number, supplier, line descriptions), products (name, description) and documents (name, content). Use it FIRST to resolve any name the user mentions ("la factura de Acme", "el proveedor de la luz", "mi comercial Marta") to a real ID before reading or changing anything. Each hit has kind, id, title, subtitle and the matched field.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.ORGANIZATIONS.READ,
    input: {
      query: z.string().trim().min(2).max(200).describe('Free text. Partial words and tax IDs work.'),
      kinds: z.array(z.enum(SEARCH_KINDS)).optional().describe('Restrict to some kinds. Omit to search everything.'),
      limitPerKind: z.number().int().min(1).max(25).default(8),
    },
    run: ({ query, kinds, limitPerKind }, { api, organizationId }) => api.request('GET', withQuery(organizationPath(organizationId, '/search'), {
      query,
      kinds: kinds?.join(','),
      limitPerKind,
    })),
  }),
];
