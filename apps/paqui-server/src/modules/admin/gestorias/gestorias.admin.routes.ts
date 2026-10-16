import type { RouteDefinitionContext } from '../../app/server.types';
import { z } from 'zod';
import { createRoleMiddleware, requireAuthentication } from '../../app/auth/auth.middleware';
import { getUser } from '../../app/auth/auth.models';
import { createGestoriaClientNotFoundError, createGestoriaInvitationNotFoundError, createGestoriaMemberNotFoundError, createGestoriaNotFoundError } from '../../gestorias/gestorias.errors';
import { normalizeGestoriaModules } from '../../gestorias/gestorias.models';
import { createGestoriasRepository } from '../../gestorias/gestorias.repository';
import { gestoriaBodySchema, gestoriaClientParamsSchema, gestoriaInvitationIdSchema, gestoriaMemberIdSchema, gestoriaModulesSchema, gestoriaParamsSchema } from '../../gestorias/gestorias.schemas';
import { addOrInviteGestoriaMember } from '../../gestorias/gestorias.usecases';
import { organizationIdSchema } from '../../organizations/organization.schemas.legacy';
import { createOrganizationNotFoundError } from '../../organizations/organizations.errors';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { PERMISSIONS } from '../../roles/roles.constants';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../../shared/validation/validation.legacy';
import { createUsersRepository } from '../../users/users.repository';

// Gestorías are only managed from the back office: an admin creates them, adds the people working there,
// and decides which companies (and which modules of each) they can read
export function registerAdminGestoriasRoutes(context: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db: context.db });
  const authorize = requirePermissions({ requiredPermissions: [PERMISSIONS.MANAGE_GESTORIAS] });

  setupGestoriasRoutes({ ...context, authorize });
  setupGestoriaMembersRoutes({ ...context, authorize });
  setupGestoriaClientsRoutes({ ...context, authorize });
  setupOrganizationGestoriasRoute({ ...context, authorize });
}

type AdminRouteContext = RouteDefinitionContext & { authorize: ReturnType<ReturnType<typeof createRoleMiddleware>['requirePermissions']> };

async function getGestoriaOrThrow({ db, gestoriaId }: { db: RouteDefinitionContext['db']; gestoriaId: string }) {
  const { gestoria } = await createGestoriasRepository({ db }).getGestoriaById({ gestoriaId });

  if (!gestoria) {
    throw createGestoriaNotFoundError();
  }

  return { gestoria };
}

function setupGestoriasRoutes({ app, db, authorize }: AdminRouteContext) {
  app.get('/api/admin/gestorias', requireAuthentication(), authorize, legacyValidateQuery(z.object({ search: z.string().trim().max(255).optional() })), async (context) => {
    const { search } = context.req.valid('query');

    return context.json(await createGestoriasRepository({ db }).listGestorias({ search }));
  });

  app.post('/api/admin/gestorias', requireAuthentication(), authorize, legacyValidateJsonBody(gestoriaBodySchema), async (context) => {
    const { gestoria } = await createGestoriasRepository({ db }).createGestoria({ gestoria: context.req.valid('json') });

    return context.json({ gestoria }, 201);
  });

  app.get('/api/admin/gestorias/:gestoriaId', requireAuthentication(), authorize, legacyValidateParams(gestoriaParamsSchema), async (context) => {
    const { gestoriaId } = context.req.valid('param');
    const gestoriasRepository = createGestoriasRepository({ db });

    const { gestoria } = await getGestoriaOrThrow({ db, gestoriaId });
    const [{ members }, { invitations }, { clients }] = await Promise.all([
      gestoriasRepository.getGestoriaMembers({ gestoriaId }),
      gestoriasRepository.getGestoriaInvitations({ gestoriaId }),
      gestoriasRepository.getGestoriaClients({ gestoriaId, includeDeleted: true }),
    ]);

    return context.json({ gestoria, members, invitations, clients });
  });

  app.put('/api/admin/gestorias/:gestoriaId', requireAuthentication(), authorize, legacyValidateParams(gestoriaParamsSchema), legacyValidateJsonBody(gestoriaBodySchema), async (context) => {
    const { gestoriaId } = context.req.valid('param');

    const { gestoria } = await createGestoriasRepository({ db }).updateGestoria({ gestoriaId, gestoria: context.req.valid('json') });

    if (!gestoria) {
      throw createGestoriaNotFoundError();
    }

    return context.json({ gestoria });
  });

  // Members and access to the companies go with it, the companies themselves are untouched
  app.delete('/api/admin/gestorias/:gestoriaId', requireAuthentication(), authorize, legacyValidateParams(gestoriaParamsSchema), async (context) => {
    const { gestoriaId } = context.req.valid('param');

    await getGestoriaOrThrow({ db, gestoriaId });
    await createGestoriasRepository({ db }).deleteGestoria({ gestoriaId });

    return context.body(null, 204);
  });
}

function setupGestoriaMembersRoutes({ app, db, config, emailsServices, authorize }: AdminRouteContext) {
  // Someone with an account is added right away; anyone else gets an email and joins when signing up with it.
  // No account is ever created on their behalf
  app.post('/api/admin/gestorias/:gestoriaId/members', requireAuthentication(), authorize, legacyValidateParams(gestoriaParamsSchema), legacyValidateJsonBody(z.object({ email: z.string().trim().toLowerCase().email() })), async (context) => {
    const { userId } = getUser({ context });
    const { gestoriaId } = context.req.valid('param');
    const { email } = context.req.valid('json');

    const { member, invitation } = await addOrInviteGestoriaMember({
      gestoriaId,
      email,
      inviterId: userId,
      gestoriasRepository: createGestoriasRepository({ db }),
      usersRepository: createUsersRepository({ db }),
      emailsServices,
      config,
    });

    return context.json({ member, invitation }, 201);
  });

  app.delete('/api/admin/gestorias/:gestoriaId/invitations/:invitationId', requireAuthentication(), authorize, legacyValidateParams(gestoriaParamsSchema.extend({ invitationId: gestoriaInvitationIdSchema })), async (context) => {
    const { gestoriaId, invitationId } = context.req.valid('param');

    const { isRemoved } = await createGestoriasRepository({ db }).deleteGestoriaInvitation({ gestoriaId, invitationId });

    if (!isRemoved) {
      throw createGestoriaInvitationNotFoundError();
    }

    return context.body(null, 204);
  });

  app.delete('/api/admin/gestorias/:gestoriaId/members/:memberId', requireAuthentication(), authorize, legacyValidateParams(gestoriaParamsSchema.extend({ memberId: gestoriaMemberIdSchema })), async (context) => {
    const { gestoriaId, memberId } = context.req.valid('param');

    const { isRemoved } = await createGestoriasRepository({ db }).removeGestoriaMember({ gestoriaId, memberId });

    if (!isRemoved) {
      throw createGestoriaMemberNotFoundError();
    }

    return context.body(null, 204);
  });
}

function setupGestoriaClientsRoutes({ app, db, authorize }: AdminRouteContext) {
  app.post('/api/admin/gestorias/:gestoriaId/clients', requireAuthentication(), authorize, legacyValidateParams(gestoriaParamsSchema), legacyValidateJsonBody(z.object({ organizationId: organizationIdSchema, modules: gestoriaModulesSchema })), async (context) => {
    const { userId } = getUser({ context });
    const { gestoriaId } = context.req.valid('param');
    const { organizationId, modules } = context.req.valid('json');

    await getGestoriaOrThrow({ db, gestoriaId });

    const { organization } = await createOrganizationsRepository({ db }).getOrganizationById({ organizationId });

    if (!organization || organization.deletedAt) {
      throw createOrganizationNotFoundError();
    }

    const { client } = await createGestoriasRepository({ db }).addGestoriaClient({ gestoriaId, organizationId, modules: normalizeGestoriaModules({ modules }), grantedBy: userId });

    return context.json({ client }, 201);
  });

  app.put('/api/admin/gestorias/:gestoriaId/clients/:organizationId', requireAuthentication(), authorize, legacyValidateParams(gestoriaClientParamsSchema), legacyValidateJsonBody(z.object({ modules: gestoriaModulesSchema })), async (context) => {
    const { userId } = getUser({ context });
    const { gestoriaId, organizationId } = context.req.valid('param');
    const { modules } = context.req.valid('json');

    const { client } = await createGestoriasRepository({ db }).updateGestoriaClientModules({ gestoriaId, organizationId, modules: normalizeGestoriaModules({ modules }), grantedBy: userId });

    if (!client) {
      throw createGestoriaClientNotFoundError();
    }

    return context.json({ client });
  });

  app.delete('/api/admin/gestorias/:gestoriaId/clients/:organizationId', requireAuthentication(), authorize, legacyValidateParams(gestoriaClientParamsSchema), async (context) => {
    const { gestoriaId, organizationId } = context.req.valid('param');

    const { isRemoved } = await createGestoriasRepository({ db }).removeGestoriaClient({ gestoriaId, organizationId });

    if (!isRemoved) {
      throw createGestoriaClientNotFoundError();
    }

    return context.body(null, 204);
  });
}

// Who can read the books of a company, shown on its back office page
function setupOrganizationGestoriasRoute({ app, db, authorize }: AdminRouteContext) {
  app.get('/api/admin/organizations/:organizationId/gestorias', requireAuthentication(), authorize, legacyValidateParams(z.object({ organizationId: organizationIdSchema })), async (context) => {
    const { organizationId } = context.req.valid('param');

    return context.json(await createGestoriasRepository({ db }).getOrganizationGestorias({ organizationId }));
  });
}
