import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createDocumentCreationUsecase } from '../documents/documents.usecases';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { getFileStreamFromMultipartForm } from '../shared/streams/file-upload';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { CAPTURE_PURPOSES, CAPTURE_TOKEN_LENGTH, MAX_CAPTURE_FILE_SIZE_BYTES, MAX_CAPTURE_FILES_BY_PURPOSE } from './captures.constants';
import { createCaptureSessionNotFoundError } from './captures.errors';
import { formatCaptureSessionForApi } from './captures.models';
import { createCapturesRepository } from './captures.repository';
import { addFileToCaptureSession, completeCaptureSessionByToken, getOpenCaptureSessionByToken, openCaptureSession } from './captures.usecases';

const organizationParamsSchema = z.object({ organizationId: organizationIdSchema });
const captureSessionParamsSchema = z.object({ organizationId: organizationIdSchema, captureSessionId: z.string().trim().min(1).max(64) });
const tokenParamsSchema = z.object({ token: z.string().length(CAPTURE_TOKEN_LENGTH) });

export function registerCapturesRoutes(context: RouteDefinitionContext) {
  setupOpenCaptureSessionRoute(context);
  setupGetCaptureSessionRoute(context);
  setupCompleteCaptureSessionRoute(context);
  setupGetCaptureByTokenRoute(context);
  setupAddCaptureFileRoute(context);
  setupCompleteCaptureByTokenRoute(context);
}

// --- The computer, with the user session

function setupOpenCaptureSessionRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/captures',
    requireAuthentication(),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(z.object({ purpose: z.enum(CAPTURE_PURPOSES) })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { purpose } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { captureSession, token } = await openCaptureSession({ organizationId, userId, purpose, capturesRepository: createCapturesRepository({ db }) });

      return context.json({ captureSession: formatCaptureSessionForApi({ captureSession }), token }, 201);
    },
  );
}

// Polled by the computer while the phone takes the photos
function setupGetCaptureSessionRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/captures/:captureSessionId',
    requireAuthentication(),
    legacyValidateParams(captureSessionParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, captureSessionId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { captureSession } = await createCapturesRepository({ db }).getUserCaptureSession({ organizationId, userId, captureSessionId });

      if (!captureSession) {
        throw createCaptureSessionNotFoundError();
      }

      return context.json({ captureSession: formatCaptureSessionForApi({ captureSession }) });
    },
  );
}

// The computer stops waiting (dialog closed): the link in the QR code stops working
function setupCompleteCaptureSessionRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/captures/:captureSessionId/complete',
    requireAuthentication(),
    legacyValidateParams(captureSessionParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, captureSessionId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const capturesRepository = createCapturesRepository({ db });
      const { captureSession: existing } = await capturesRepository.getUserCaptureSession({ organizationId, userId, captureSessionId });

      if (!existing) {
        throw createCaptureSessionNotFoundError();
      }

      const { captureSession } = await capturesRepository.completeCaptureSession({ captureSessionId });

      return context.json({ captureSession: formatCaptureSessionForApi({ captureSession }) });
    },
  );
}

// --- The phone, authorized by the token of the QR code only

function setupGetCaptureByTokenRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/captures/:token',
    legacyValidateParams(tokenParamsSchema),
    async (context) => {
      const { token } = context.req.valid('param');

      const capturesRepository = createCapturesRepository({ db });
      const { captureSession: existing } = await getOpenCaptureSessionByToken({ token, capturesRepository });
      // The phone is here: the computer stops showing the QR code and waits for the photos
      const { captureSession } = existing.completedAt === null ? await capturesRepository.markCaptureSessionOpened({ captureSessionId: existing.id }) : { captureSession: existing };
      const { organization } = await createOrganizationsRepository({ db }).getOrganizationById({ organizationId: captureSession.organizationId });

      return context.json({
        capture: {
          purpose: captureSession.purpose,
          status: formatCaptureSessionForApi({ captureSession }).status,
          fileCount: captureSession.documentIds.length,
          maxFiles: MAX_CAPTURE_FILES_BY_PURPOSE[captureSession.purpose],
          expiresAt: captureSession.expiresAt,
          organizationName: organization?.name ?? null,
        },
      });
    },
  );
}

function setupAddCaptureFileRoute({ app, ...deps }: RouteDefinitionContext) {
  app.post(
    '/api/captures/:token/files',
    legacyValidateParams(tokenParamsSchema),
    async (context) => {
      const { token } = context.req.valid('param');

      const { captureSession } = await addFileToCaptureSession({
        token,
        getFile: async () => getFileStreamFromMultipartForm({ body: context.req.raw.body, headers: context.req.header(), maxFileSize: MAX_CAPTURE_FILE_SIZE_BYTES }),
        createDocument: createDocumentCreationUsecase({ ...deps }),
        capturesRepository: createCapturesRepository({ db: deps.db }),
      });

      return context.json({ fileCount: captureSession.documentIds.length }, 201);
    },
  );
}

function setupCompleteCaptureByTokenRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/captures/:token/complete',
    legacyValidateParams(tokenParamsSchema),
    async (context) => {
      const { token } = context.req.valid('param');

      const { captureSession } = await completeCaptureSessionByToken({ token, capturesRepository: createCapturesRepository({ db }) });

      return context.json({ fileCount: captureSession.documentIds.length });
    },
  );
}
