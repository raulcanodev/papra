import type { RouteDefinitionContext } from '../app/server.types';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { AI_FEATURES } from '../ai-usage/ai-usage.constants';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { getFileStreamFromMultipartForm } from '../shared/streams/file-upload';
import { legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { MAX_DICTATION_AUDIO_SIZE_BYTES } from './ai-assistant.constants';
import { transcribeAudio } from './ai-assistant.providers';

// A message dictated to the assistant: the recording is sent once the user stops, and comes back as text
// to review in the input before sending it. The audio is not kept.
export function registerAiTranscriptionRoutes({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/ai/transcriptions',
    requireAuthentication(),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateQuery(z.object({ language: z.string().regex(/^[a-z]{2}$/).optional() })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { language } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { fileStream, fileName, mimeType } = await getFileStreamFromMultipartForm({ body: context.req.raw.body, headers: context.req.header(), maxFileSize: MAX_DICTATION_AUDIO_SIZE_BYTES });
      const audio = await new Response(Readable.toWeb(fileStream) as ReadableStream).blob();

      const { text } = await transcribeAudio({ config, db, feature: AI_FEATURES.VOICE_DICTATION, audio, fileName: fileName || 'dictation.webm', mimeType, language, organizationId, userId });

      return context.json({ text });
    },
  );
}
