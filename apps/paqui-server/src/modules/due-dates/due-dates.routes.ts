import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createRemindersRepository } from '../notifications/notifications.repository';
import { reminderListQuerySchema } from '../notifications/notifications.schemas';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createDueDatesRepository } from './due-dates.repository';
import { dueDateSettingsBodySchema, dueDatesListQuerySchema, instalmentIdSchema, instalmentStatusBodySchema } from './due-dates.schemas';

const organizationParamsSchema = z.object({ organizationId: organizationIdSchema });
const instalmentParamsSchema = z.object({ organizationId: organizationIdSchema, instalmentId: instalmentIdSchema });

export function registerDueDatesRoutes(context: RouteDefinitionContext) {
  setupListDueDatesRoute(context);
  setupSetInstalmentStatusRoute(context);
  setupGetDueDateSettingsRoute(context);
  setupUpdateDueDateSettingsRoute(context);
  setupListRemindersRoute(context);
}

// Every due date to pay and to collect (or one side only), with their invoice and contact
function setupListDueDatesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/due-dates',
    requireAuthentication({ apiKeyPermissions: ['purchases:read', 'invoices:read'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateQuery(dueDatesListQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { direction, from, to } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { instalments } = await createDueDatesRepository({ db }).listInstalments({ organizationId, direction, from, to });

      return context.json({ instalments });
    },
  );
}

// Mark one due date paid, returned (the charge bounced) or pending again
function setupSetInstalmentStatusRoute({ app, db }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/due-dates/:instalmentId/status',
    requireAuthentication({ apiKeyPermissions: ['purchases:update', 'invoices:update'] }),
    legacyValidateParams(instalmentParamsSchema),
    legacyValidateJsonBody(instalmentStatusBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, instalmentId } = context.req.valid('param');
      const { status } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { instalment } = await createDueDatesRepository({ db }).setInstalmentStatus({ organizationId, instalmentId, status });

      return context.json({ instalment });
    },
  );
}

function setupGetDueDateSettingsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/due-dates/settings',
    requireAuthentication(),
    legacyValidateParams(organizationParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      return context.json(await createDueDatesRepository({ db }).getSettings({ organizationId }));
    },
  );
}

function setupUpdateDueDateSettingsRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/due-dates/settings',
    requireAuthentication(),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(dueDateSettingsBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const settings = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      return context.json(await createDueDatesRepository({ db }).saveSettings({ organizationId, settings }));
    },
  );
}

// The reminders of the organization (due dates today, any other kind tomorrow), for an in-app list
function setupListRemindersRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/reminders',
    requireAuthentication(),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateQuery(reminderListQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { status, from, to } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      return context.json(await createRemindersRepository({ db }).listReminders({ organizationId, status, from, to }));
    },
  );
}
