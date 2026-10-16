import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { QUARTERS } from '../taxes/taxes.constants';
import { getQuarterPeriod } from '../taxes/taxes.models';
import { createUsersRepository } from '../users/users.repository';
import { GESTORIA_MODULES } from './gestorias.constants';
import { createGestoriaNotFoundError } from './gestorias.errors';
import { hasGestoriaModule } from './gestorias.models';
import { createGestoriasRepository } from './gestorias.repository';
import { gestoriaClientParamsSchema, gestoriaParamsSchema } from './gestorias.schemas';
import { acceptPendingGestoriaInvitationsOfUser, ensureGestoriaCanReadClient, ensureUserIsInGestoria } from './gestorias.usecases';
import { registerGestoriaInvoicesRoutes } from './modules/invoices/gestoria-invoices.routes';
import { registerGestoriaPurchasesRoutes } from './modules/purchases/gestoria-purchases.routes';
import { registerGestoriaTaxesRoutes } from './modules/taxes/gestoria-taxes.routes';

// The gestoría workspace: read-only, session only (no API key), every read goes through the gestoría membership
// and the access the admin granted on each client company
export function registerGestoriasRoutes(context: RouteDefinitionContext) {
  setupListUserGestoriasRoute(context);
  setupGetGestoriaRoute(context);
  setupGetGestoriaClientsActivityRoute(context);
  setupGetGestoriaClientRoute(context);

  // One registration per module a gestoría can be granted on a client
  registerGestoriaInvoicesRoutes(context);
  registerGestoriaPurchasesRoutes(context);
  registerGestoriaTaxesRoutes(context);
}

function setupListUserGestoriasRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias',
    requireAuthentication(),
    async (context) => {
      const { userId } = getUser({ context });
      const gestoriasRepository = createGestoriasRepository({ db });

      // Someone invited by email becomes a member the first time the app asks for their gestorías
      await acceptPendingGestoriaInvitationsOfUser({ userId, gestoriasRepository, usersRepository: createUsersRepository({ db }) });

      const { gestorias } = await gestoriasRepository.getUserGestorias({ userId });

      return context.json({ gestorias });
    },
  );
}

function setupGetGestoriaRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId',
    requireAuthentication(),
    legacyValidateParams(gestoriaParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId } = context.req.valid('param');
      const gestoriasRepository = createGestoriasRepository({ db });

      await ensureUserIsInGestoria({ userId, gestoriaId, gestoriasRepository });

      const [{ gestoria }, { clients }] = await Promise.all([
        gestoriasRepository.getGestoriaById({ gestoriaId }),
        gestoriasRepository.getGestoriaClients({ gestoriaId }),
      ]);

      if (!gestoria) {
        throw createGestoriaNotFoundError();
      }

      return context.json({
        gestoria: { id: gestoria.id, name: gestoria.name, taxId: gestoria.taxId },
        clients: clients.map(({ organizationId, name, legalName, taxId, legalForm, modules }) => ({ organizationId, name, legalName, taxId, legalForm, modules })),
      });
    },
  );
}

/** What changed in each client company during a quarter: the overview of the gestoría home */
function setupGetGestoriaClientsActivityRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/activity',
    requireAuthentication(),
    legacyValidateParams(gestoriaParamsSchema),
    legacyValidateQuery(z.object({
      year: z.coerce.number().int().min(2000).max(2100),
      quarter: z.coerce.number().int().refine((value): value is typeof QUARTERS[number] => (QUARTERS as readonly number[]).includes(value), 'Quarter must be 1 to 4'),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId } = context.req.valid('param');
      const { year, quarter } = context.req.valid('query');
      const gestoriasRepository = createGestoriasRepository({ db });

      await ensureUserIsInGestoria({ userId, gestoriaId, gestoriasRepository });

      const { clients } = await gestoriasRepository.getGestoriaClients({ gestoriaId });
      const { start, end } = getQuarterPeriod({ year, quarter });
      const { activity } = await gestoriasRepository.getGestoriaClientsActivity({ organizationIds: clients.map(client => client.organizationId), from: start, to: end });

      // Figures of a module the gestoría was not granted on a client are never sent
      return context.json({
        period: { year, quarter, start, end },
        activity: activity.map(({ organizationId, issued, received }) => {
          const modules = clients.find(client => client.organizationId === organizationId)?.modules ?? [];

          return {
            organizationId,
            issued: hasGestoriaModule({ modules, module: GESTORIA_MODULES.INVOICES }) ? issued : null,
            received: hasGestoriaModule({ modules, module: GESTORIA_MODULES.PURCHASES }) ? received : null,
          };
        }),
      });
    },
  );
}

function setupGetGestoriaClientRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/clients/:organizationId',
    requireAuthentication(),
    legacyValidateParams(gestoriaClientParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId, organizationId } = context.req.valid('param');
      const gestoriasRepository = createGestoriasRepository({ db });

      await ensureGestoriaCanReadClient({ userId, gestoriaId, organizationId, gestoriasRepository });

      const { clients } = await gestoriasRepository.getGestoriaClients({ gestoriaId });
      const client = clients.find(item => item.organizationId === organizationId)!;

      return context.json({
        client: { organizationId, name: client.name, legalName: client.legalName, taxId: client.taxId, legalForm: client.legalForm, modules: client.modules },
      });
    },
  );
}
