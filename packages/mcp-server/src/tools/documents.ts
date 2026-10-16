import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { apiPathSegment, runTool } from './shared.js';
import type { ToolRegistrar } from './types.js';

// The only tool that is not in the shared catalog: it reads a path on the machine running the server,
// so it exists for the local (stdio) transport only.
export const registerLocalFileTools: ToolRegistrar = ({ server, client, options }) => {
  if (!options.enableLocalFileTools) {
    return;
  }

  server.registerTool('upload_document', {
    title: 'Upload local document',
    description: 'Upload a file from the local machine to a Paqui organization. Confirm the file and organization first.',
    inputSchema: {
      organizationId: z.string().min(1),
      filePath: z.string().min(1).describe('Absolute or working-directory-relative local file path'),
      fileName: z.string().min(1).optional().describe('Optional name sent to Paqui'),
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
};
