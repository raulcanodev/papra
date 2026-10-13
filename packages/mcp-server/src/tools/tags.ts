import { z } from 'zod';
import type { ToolRegistrar } from './types.js';
import { apiPathSegment, runTool } from './shared.js';

export const registerTagTools: ToolRegistrar = ({ server, client }) => {
  server.registerTool('list_tags', {
    title: 'List tags',
    description: 'List all tags in a Papra organization.',
    inputSchema: { organizationId: z.string().min(1) },
    annotations: readOnlyAnnotations,
  }, async ({ organizationId }) => runTool(() => client.request(
    'GET',
    tagsPath(organizationId),
  )));

  server.registerTool('create_tag', {
    title: 'Create tag',
    description: 'Create a tag in a Papra organization. Confirm the name and color first.',
    inputSchema: {
      organizationId: z.string().min(1),
      name: z.string().trim().min(1).max(50),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).describe('Hex color such as #2563eb'),
      description: z.string().trim().max(256).optional(),
    },
    annotations: writeAnnotations,
  }, async ({ organizationId, name, color, description }) => runTool(() => client.request(
    'POST',
    tagsPath(organizationId),
    withoutUndefined({ name, color, description }),
  )));

  server.registerTool('add_tag_to_document', {
    title: 'Add tag to document',
    description: 'Attach an existing Papra tag to a document.',
    inputSchema: tagDocumentIdentitySchema,
    annotations: { ...writeAnnotations, idempotentHint: true },
  }, async ({ organizationId, documentId, tagId }) => runTool(() => client.request(
    'POST',
    documentTagsPath(organizationId, documentId),
    { tagId },
  )));

  server.registerTool('remove_tag_from_document', {
    title: 'Remove tag from document',
    description: 'Detach a Papra tag from a document. Confirm this removal first.',
    inputSchema: tagDocumentIdentitySchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ organizationId, documentId, tagId }) => runTool(() => client.request(
    'DELETE',
    `${documentTagsPath(organizationId, documentId)}/${apiPathSegment(tagId)}`,
  )));
};

const tagDocumentIdentitySchema = {
  organizationId: z.string().min(1),
  documentId: z.string().min(1),
  tagId: z.string().min(1),
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

function tagsPath(organizationId: string): string {
  return `/api/organizations/${apiPathSegment(organizationId)}/tags`;
}

function documentTagsPath(organizationId: string, documentId: string): string {
  return `/api/organizations/${apiPathSegment(organizationId)}/documents/${apiPathSegment(documentId)}/tags`;
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
