import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createCustomPropertiesRepository } from '../custom-properties/custom-properties.repository';
import { getEntitiesCustomProperties, saveEntityWithCustomProperties } from '../custom-properties/entity-custom-properties.usecases';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createContactNotFoundError } from './contacts.errors';
import { getContactCustomPropertyEntityTypes } from './contacts.models';
import { createContactsRepository } from './contacts.repository';
import { contactBodySchema, contactIdSchema, contactListQuerySchema } from './contacts.schemas';

const organizationParamsSchema = z.object({ organizationId: organizationIdSchema });
const contactParamsSchema = z.object({ organizationId: organizationIdSchema, contactId: contactIdSchema });

export function registerContactsRoutes(context: RouteDefinitionContext) {
  setupListContactsRoute(context);
  setupGetContactRoute(context);
  setupCreateContactRoute(context);
  setupUpdateContactRoute(context);
}

function setupListContactsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/contacts',
    requireAuthentication(),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateQuery(contactListQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { role } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { contacts } = await createContactsRepository({ db }).listContacts({ organizationId, role });

      return context.json({ contacts });
    },
  );
}

function setupGetContactRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/contacts/:contactId',
    requireAuthentication(),
    legacyValidateParams(contactParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, contactId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { contact } = await createContactsRepository({ db }).getContact({ organizationId, contactId });

      if (!contact) {
        throw createContactNotFoundError();
      }

      const { customPropertiesByEntityId } = await getEntitiesCustomProperties({
        organizationId,
        entityTypes: getContactCustomPropertyEntityTypes({ contact }),
        entityIds: [contact.id],
        customPropertiesRepository: createCustomPropertiesRepository({ db }),
      });

      return context.json({ contact, customProperties: customPropertiesByEntityId[contact.id] ?? [] });
    },
  );
}

function setupCreateContactRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/contacts',
    requireAuthentication(),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(contactBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { customProperties, ...contact } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const created = await saveEntityWithCustomProperties({
        db,
        organizationId,
        // The properties allowed are the ones of the roles the contact will have
        entityTypes: getContactCustomPropertyEntityTypes({ contact }),
        customProperties,
        persistEntity: async ({ db: tx }) => (await createContactsRepository({ db: tx }).createContact({ organizationId, contact })).contact,
      });

      return context.json({ contact: created }, 201);
    },
  );
}

function setupUpdateContactRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/contacts/:contactId',
    requireAuthentication(),
    legacyValidateParams(contactParamsSchema),
    legacyValidateJsonBody(contactBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, contactId } = context.req.valid('param');
      const { customProperties, ...contact } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const updated = await saveEntityWithCustomProperties({
        db,
        organizationId,
        entityTypes: getContactCustomPropertyEntityTypes({ contact }),
        customProperties,
        persistEntity: async ({ db: tx }) => (await createContactsRepository({ db: tx }).updateContact({ organizationId, contactId, contact })).contact,
      });

      return context.json({ contact: updated });
    },
  );
}
