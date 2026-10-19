import type { Resend } from 'resend';
import type { RouteDefinitionContext } from '../app/server.types';
import { Resend as ResendClient } from 'resend';
import { z } from 'zod';
import { createUnauthorizedError } from '../app/auth/auth.errors';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createDocumentCreationUsecase } from '../documents/documents.usecases';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createPlansRepository } from '../plans/plans.repository';
import { queueIntakeDocumentReading } from '../purchases/readings/document-readings.inbox';
import { createError } from '../shared/errors/errors';
import { getHeader } from '../shared/headers/headers.models';
import { addLogContext, createLogger } from '../shared/logger/logger';
import { isNil } from '../shared/utils';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { createSubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { createUsersRepository } from '../users/users.repository';
import { INTAKE_EMAILS_INGEST_ROUTE } from './intake-emails.constants';
import { extractEmailAddress, getRecipientAddressesFromValues } from './intake-emails.models';
import { createIntakeEmailsRepository } from './intake-emails.repository';
import { allowedOriginsSchema, intakeEmailAliasSchema, intakeEmailIdSchema } from './intake-emails.schemas.legacy';
import { createIntakeEmailsServices } from './intake-emails.services';
import { createIntakeEmail, deleteIntakeEmail, processIntakeEmailIngestion } from './intake-emails.usecases';

const logger = createLogger({ namespace: 'intake-emails.routes' });

export function registerIntakeEmailsRoutes(context: RouteDefinitionContext) {
  setupIngestIntakeEmailRoute(context);
  setupGetOrganizationIntakeEmailsRoute(context);
  setupCreateIntakeEmailRoute(context);
  setupDeleteIntakeEmailRoute(context);
  setupUpdateIntakeEmailRoute(context);
}

function setupGetOrganizationIntakeEmailsRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/intake-emails',
    requireAuthentication(),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });
      const intakeEmailsServices = createIntakeEmailsServices({ config });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const [{ intakeEmails }, { deliveries }] = await Promise.all([
        intakeEmailsRepository.getOrganizationIntakeEmails({ organizationId }),
        intakeEmailsRepository.listOrganizationIntakeEmailDeliveries({ organizationId }),
      ]);

      return context.json({ intakeEmails, deliveries, domain: intakeEmailsServices.getEmailDomain() });
    },
  );
}

function setupCreateIntakeEmailRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/intake-emails',
    requireAuthentication(),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    legacyValidateJsonBody(z.object({ alias: intakeEmailAliasSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { alias } = context.req.valid('json');

      const usersRepository = createUsersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });
      const intakeEmailsServices = createIntakeEmailsServices({ config });
      const plansRepository = createPlansRepository({ config });
      const subscriptionsRepository = createSubscriptionsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });
      const { user } = await usersRepository.getUserById({ userId });

      const { intakeEmail } = await createIntakeEmail({
        alias,
        initialAllowedOrigins: user ? [user.email.toLowerCase()] : [],
        organizationId,
        intakeEmailsRepository,
        intakeEmailsServices,
        plansRepository,
        subscriptionsRepository,
      });

      return context.json({ intakeEmail });
    },
  );
}

function setupDeleteIntakeEmailRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/intake-emails/:intakeEmailId',
    requireAuthentication(),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      intakeEmailId: intakeEmailIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, intakeEmailId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });
      const intakeEmailsServices = createIntakeEmailsServices({ config });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await deleteIntakeEmail({ intakeEmailId, organizationId, intakeEmailsRepository, intakeEmailsServices });

      return context.body(null, 204);
    },
  );
}

function setupUpdateIntakeEmailRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/intake-emails/:intakeEmailId',
    requireAuthentication(),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      intakeEmailId: intakeEmailIdSchema,
    })),
    legacyValidateJsonBody(z.object({
      isEnabled: z.boolean().optional(),
      allowedOrigins: allowedOriginsSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, intakeEmailId } = context.req.valid('param');
      const { isEnabled, allowedOrigins } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { intakeEmail } = await intakeEmailsRepository.updateIntakeEmail({
        intakeEmailId,
        organizationId,
        isEnabled,
        allowedOrigins,
      });

      return context.json({ intakeEmail });
    },
  );
}

function setupIngestIntakeEmailRoute({ app, db, config, taskServices, documentsStorageService, eventServices }: RouteDefinitionContext) {
  app.post(
    INTAKE_EMAILS_INGEST_ROUTE,
    async (context) => {
      if (!config.intakeEmails.isEnabled) {
        throw createError({
          message: 'Intake emails are disabled',
          code: 'intake_emails.disabled',
          statusCode: 403,
        });
      }

      const webhookId = getHeader({ context, name: 'svix-id' });
      const webhookTimestamp = getHeader({ context, name: 'svix-timestamp' });
      const webhookSignature = getHeader({ context, name: 'svix-signature' });

      if (isNil(webhookId) || isNil(webhookTimestamp) || isNil(webhookSignature)) {
        throw createError({
          message: 'Resend signature headers are required',
          code: 'intake_emails.signature_header_required',
          statusCode: 400,
        });
      }

      const payload = await context.req.text();
      const resend = new ResendClient(config.emails.drivers.resend.resendApiKey || 're_intake_emails');
      let event: ReturnType<Resend['webhooks']['verify']>;

      try {
        event = resend.webhooks.verify({
          payload,
          headers: {
            id: webhookId,
            timestamp: webhookTimestamp,
            signature: webhookSignature,
          },
          webhookSecret: config.intakeEmails.webhookSecret,
        });
      } catch (error) {
        logger.error({ error }, 'Invalid Resend webhook signature');

        throw createUnauthorizedError();
      }

      if (event.type !== 'email.received') {
        return context.body(null, 204);
      }

      const fromAddress = extractEmailAddress({ value: event.data.from });
      const recipientsAddresses = getRecipientAddressesFromValues({
        recipients: [...event.data.to, ...event.data.received_for],
      });
      const attachments = await downloadResendAttachments({
        resend,
        emailId: event.data.email_id,
        expectedAttachments: event.data.attachments,
      });

      addLogContext({ fromAddress, recipientsAddresses, resendEmailId: event.data.email_id });
      logger.info({ attachmentsCount: attachments.length }, 'Received Resend intake email');

      const intakeEmailsRepository = createIntakeEmailsRepository({ db });

      const createDocument = createDocumentCreationUsecase({
        documentsStorageService,
        db,
        config,
        taskServices,
        eventServices,
      });

      await processIntakeEmailIngestion({
        fromAddress,
        recipientsAddresses,
        subject: event.data.subject,
        providerMessageId: event.data.email_id,
        attachments,
        intakeEmailsRepository,
        createDocument,
        // Invoices forwarded by email are read like the ones uploaded on the purchases page
        onDocumentCreated: async ({ organizationId, document }) => queueIntakeDocumentReading({ db, config, documentsStorageService, taskServices, organizationId, document }),
      });

      return context.body(null, 202);
    },
  );
}

async function downloadResendAttachments({
  resend,
  emailId,
  expectedAttachments,
}: {
  resend: Resend;
  emailId: string;
  expectedAttachments: Array<{ content_disposition: string | null }>;
}) {
  if (!expectedAttachments.some(({ content_disposition: disposition }) => disposition !== 'inline')) {
    return [];
  }

  const { data, error } = await resend.emails.receiving.attachments.list({ emailId });

  if (error) {
    throw createError({
      message: 'Failed to list Resend email attachments',
      code: 'intake_emails.list_attachments_failed',
      statusCode: 502,
      isInternal: true,
    });
  }

  return Promise.all(data.data
    .filter(({ content_disposition: disposition }) => disposition !== 'inline')
    .map(async (attachment) => {
      const response = await fetch(attachment.download_url);

      if (!response.ok) {
        throw createError({
          message: 'Failed to download Resend email attachment',
          code: 'intake_emails.download_attachment_failed',
          statusCode: 502,
          isInternal: true,
        });
      }

      return new File(
        [new Uint8Array(await response.arrayBuffer())],
        attachment.filename ?? `attachment-${attachment.id}`,
        { type: attachment.content_type },
      );
    }));
}
