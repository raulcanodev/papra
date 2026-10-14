import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, segment, withoutUndefined, withQuery } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { idSchema } from './schemas';

export const documentTools = [
  defineOrganizationTool({
    name: 'list_documents',
    title: 'List documents',
    description: 'Search and page through the documents of the organization by name or extracted content. An empty query lists the latest documents.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.DOCUMENTS.READ,
    input: {
      searchQuery: z.string().optional(),
      pageIndex: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
    run: ({ searchQuery, pageIndex, pageSize }, { api, organizationId }) => api.request(
      'GET',
      withQuery(organizationPath(organizationId, '/documents'), {
        searchQuery: searchQuery ?? '',
        pageIndex: pageIndex ?? 0,
        pageSize: pageSize ?? 25,
      }),
    ),
  }),
  defineOrganizationTool({
    name: 'get_document',
    title: 'Get document',
    description: 'Get a document with its metadata, tags and extracted text content. Read it before summarizing or answering questions about it.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.DOCUMENTS.READ,
    input: { documentId: idSchema('Document ID') },
    run: ({ documentId }, { api, organizationId }) => api.request('GET', organizationPath(organizationId, `/documents/${segment(documentId)}`)),
  }),
  defineOrganizationTool({
    name: 'get_document_statistics',
    title: 'Get document statistics',
    description: 'Document counts and storage usage of the organization.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.DOCUMENTS.READ,
    run: (_input, { api, organizationId }) => api.request('GET', organizationPath(organizationId, '/documents/statistics')),
  }),
  defineOrganizationTool({
    name: 'update_document',
    title: 'Update document',
    description: 'Rename a document, change its text content or its document date. Only the fields you pass change.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.DOCUMENTS.UPDATE,
    input: {
      documentId: idSchema('Document ID'),
      name: z.string().min(1).max(255).optional(),
      content: z.string().optional(),
      documentDate: z.string().nullable().optional().describe('ISO 8601 date-time, or null to clear it'),
    },
    run: ({ documentId, name, content, documentDate }, { api, organizationId }) => api.request(
      'PATCH',
      organizationPath(organizationId, `/documents/${segment(documentId)}`),
      withoutUndefined({ name, content, documentDate }),
    ),
  }),
];
