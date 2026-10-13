import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { ToolRegistrar } from './types.js';
import { apiPathSegment, runTool } from './shared.js';

export const registerDocumentTools: ToolRegistrar = ({ server, client, options }) => {
  server.registerTool('list_documents', {
    title: 'List documents',
    description: 'Search and page through documents in a Papra organization.',
    inputSchema: {
      organizationId: z.string().min(1),
      searchQuery: z.string().optional(),
      pageIndex: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
    annotations: readOnlyAnnotations,
  }, async ({ organizationId, searchQuery, pageIndex, pageSize }) => runTool(() => {
    const query = new URLSearchParams({
      searchQuery: searchQuery ?? '',
      pageIndex: String(pageIndex ?? 0),
      pageSize: String(pageSize ?? 25),
    });
    return client.request('GET', `/api/organizations/${apiPathSegment(organizationId)}/documents?${query}`);
  }));

  server.registerTool('get_document', {
    title: 'Get document',
    description: 'Get a Papra document, including its metadata and tags.',
    inputSchema: documentIdentitySchema,
    annotations: readOnlyAnnotations,
  }, async ({ organizationId, documentId }) => runTool(() => client.request(
    'GET',
    documentPath(organizationId, documentId),
  )));

  server.registerTool('get_document_statistics', {
    title: 'Get document statistics',
    description: 'Get document counts and storage usage for a Papra organization.',
    inputSchema: {
      organizationId: z.string().min(1),
    },
    annotations: readOnlyAnnotations,
  }, async ({ organizationId }) => runTool(() => client.request(
    'GET',
    `/api/organizations/${apiPathSegment(organizationId)}/documents/statistics`,
  )));

  server.registerTool('update_document', {
    title: 'Update document',
    description: 'Update a document name, text content, or document date. Read the document first and confirm the change.',
    inputSchema: {
      organizationId: z.string().min(1),
      documentId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      content: z.string().optional(),
      documentDate: z.string().nullable().optional().describe('ISO 8601 date-time or null'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ organizationId, documentId, name, content, documentDate }) => runTool(() => client.request(
    'PATCH',
    documentPath(organizationId, documentId),
    withoutUndefined({ name, content, documentDate }),
  )));

  if (options.enableLocalFileTools) {
    server.registerTool('upload_document', {
      title: 'Upload local document',
      description: 'Upload a file from the local machine to a Papra organization. Confirm the file and organization first.',
      inputSchema: {
        organizationId: z.string().min(1),
        filePath: z.string().min(1).describe('Absolute or working-directory-relative local file path'),
        fileName: z.string().min(1).optional().describe('Optional name sent to Papra'),
        mimeType: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    }, async ({ organizationId, filePath, fileName, mimeType }) => runTool(async () => {
      const bytes = await readFile(filePath);
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType ?? 'application/octet-stream' }), fileName ?? basename(filePath));
      return client.requestForm('POST', `/api/organizations/${apiPathSegment(organizationId)}/documents`, form);
    }));
  }
};

const documentIdentitySchema = {
  organizationId: z.string().min(1),
  documentId: z.string().min(1),
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function documentPath(organizationId: string, documentId: string): string {
  return `/api/organizations/${apiPathSegment(organizationId)}/documents/${apiPathSegment(documentId)}`;
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
