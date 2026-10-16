import type { RouteDefinitionContext } from '../../app/server.types';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { requireAuthentication } from '../../app/auth/auth.middleware';
import { getUser } from '../../app/auth/auth.models';
import { formatDocumentForApi } from '../../documents/documents.models';
import { createDocumentsRepository } from '../../documents/documents.repository';
import { createDocumentCreationUsecase } from '../../documents/documents.usecases';
import { organizationIdSchema } from '../../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../../organizations/organizations.usecases';
import { getFileStreamFromMultipartForm } from '../../shared/streams/file-upload';
import { legacyValidateParams } from '../../shared/validation/validation.legacy';
import { MAX_ATTACHMENT_SIZE_BYTES } from './attachments.constants';

export function registerAiAttachmentsRoutes(routeContext: RouteDefinitionContext) {
  setupUploadAttachmentRoute(routeContext);
}

// A file attached to the assistant becomes a document of the organization. Attaching a file that is already there
// (the same invoice twice, a spreadsheet sent again) gives back the existing document instead of a duplicate error
function setupUploadAttachmentRoute({ app, ...deps }: RouteDefinitionContext) {
  const { db } = deps;

  app.post(
    '/api/organizations/:organizationId/ai/attachments',
    requireAuthentication(),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { fileStream, fileName, mimeType } = await getFileStreamFromMultipartForm({ body: context.req.raw.body, headers: context.req.header(), maxFileSize: MAX_ATTACHMENT_SIZE_BYTES });
      const data = Buffer.from(await new Response(Readable.toWeb(fileStream) as ReadableStream).arrayBuffer());

      const documentsRepository = createDocumentsRepository({ db });
      const findExisting = async () => {
        const { document } = await documentsRepository.getOrganizationDocumentBySha256Hash({ sha256Hash: createHash('sha256').update(data).digest('hex'), organizationId });
        return document !== undefined && !document.isDeleted ? document : undefined;
      };

      const existing = await findExisting();
      if (existing) {
        return context.json({ document: formatDocumentForApi({ document: existing }), isExisting: true });
      }

      const { document } = await createDocumentCreationUsecase({ ...deps })({ fileStream: Readable.from(data), fileName, mimeType, userId, organizationId });

      return context.json({ document: formatDocumentForApi({ document }), isExisting: false });
    },
  );
}
