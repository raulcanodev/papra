import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, segment, withoutUndefined } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { idSchema } from './schemas';

export const tagTools = [
  defineOrganizationTool({
    name: 'list_tags',
    title: 'List tags',
    description: 'List all the tags of the organization with their IDs.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.TAGS.READ,
    run: (_input, { api, organizationId }) => api.request('GET', organizationPath(organizationId, '/tags')),
  }),
  defineOrganizationTool({
    name: 'create_tag',
    title: 'Create tag',
    description: 'Create a tag. List the tags first to avoid duplicates.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.TAGS.CREATE,
    input: {
      name: z.string().trim().min(1).max(50),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).describe('Hex color such as #2563eb'),
      description: z.string().trim().max(256).optional(),
    },
    run: (tag, { api, organizationId }) => api.request('POST', organizationPath(organizationId, '/tags'), withoutUndefined(tag)),
  }),
  defineOrganizationTool({
    name: 'add_tag_to_document',
    title: 'Add tag to document',
    description: 'Attach an existing tag to a document. Get the tag ID from list_tags and the document ID from list_documents or search_workspace.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.DOCUMENTS.UPDATE,
    input: { documentId: idSchema('Document ID'), tagId: idSchema('Tag ID') },
    run: ({ documentId, tagId }, { api, organizationId }) => api.request(
      'POST',
      organizationPath(organizationId, `/documents/${segment(documentId)}/tags`),
      { tagId },
    ),
  }),
  defineOrganizationTool({
    name: 'remove_tag_from_document',
    title: 'Remove tag from document',
    description: 'Detach a tag from a document. The tag itself is kept and stays on its other documents.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.DOCUMENTS.UPDATE,
    input: { documentId: idSchema('Document ID'), tagId: idSchema('Tag ID') },
    run: ({ documentId, tagId }, { api, organizationId }) => api.request(
      'DELETE',
      organizationPath(organizationId, `/documents/${segment(documentId)}/tags/${segment(tagId)}`),
    ),
  }),
];
