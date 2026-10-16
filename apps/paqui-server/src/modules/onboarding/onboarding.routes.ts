import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { createForbiddenError } from '../app/auth/auth.errors';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createGestoriasRepository } from '../gestorias/gestorias.repository';
import { acceptPendingGestoriaInvitationsOfUser } from '../gestorias/gestorias.usecases';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { createUsersRepository } from '../users/users.repository';
import { canManageOrganizationOnboarding, getUserOnboardingFlow } from './onboarding.models';
import { createOnboardingRepository } from './onboarding.repository';

// Step ids are defined by the client flows; the server only stores where the user is.
const onboardingStateSchema = z.object({
  completed: z.boolean(),
  step: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).nullable().optional(),
});

export function registerOnboardingRoutes(context: RouteDefinitionContext) {
  setupGetOnboardingRoute(context);
  setupUpdateUserOnboardingRoute(context);
  setupUpdateOrganizationOnboardingRoute(context);
}

function setupGetOnboardingRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/onboarding',
    requireAuthentication(),
    async (context) => {
      const { userId } = getUser({ context });

      const onboardingRepository = createOnboardingRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });
      const usersRepository = createUsersRepository({ db });

      const { user } = await usersRepository.getUserByIdOrThrow({ userId });
      const gestoriasRepository = createGestoriasRepository({ db });

      // Someone invited to a gestoría by email joins it before the flow is picked, so they get no onboarding
      await acceptPendingGestoriaInvitationsOfUser({ userId, gestoriasRepository, usersRepository });

      const [
        { onboarding },
        { memberships },
        { pendingInvitationsCount },
        { gestorias },
      ] = await Promise.all([
        onboardingRepository.getUserOnboarding({ userId }),
        onboardingRepository.getUserMemberships({ userId }),
        organizationsRepository.getPendingInvitationsCount({ email: user.email.toLowerCase() }),
        gestoriasRepository.getUserGestorias({ userId }),
      ]);

      const flow = getUserOnboardingFlow({
        onboardingCompletedAt: onboarding?.completedAt ?? null,
        memberships,
        pendingInvitationsCount,
        isGestoriaMember: gestorias.length > 0,
      });

      return context.json({
        flow,
        user: {
          completedAt: onboarding?.completedAt ?? null,
          step: onboarding?.step ?? null,
        },
        // Companies the user can still finish setting up, oldest first
        pendingOrganizations: memberships
          .filter(membership => !membership.onboardingCompletedAt && canManageOrganizationOnboarding(membership))
          .map(({ organizationId, organizationName, onboardingStep }) => ({ id: organizationId, name: organizationName, step: onboardingStep })),
        pendingInvitationsCount,
      });
    },
  );
}

function setupUpdateUserOnboardingRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/onboarding',
    requireAuthentication(),
    legacyValidateJsonBody(onboardingStateSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { completed, step } = context.req.valid('json');

      const onboardingRepository = createOnboardingRepository({ db });

      await onboardingRepository.setUserOnboarding({ userId, completed, step: step ?? null });

      return context.body(null, 204);
    },
  );
}

function setupUpdateOrganizationOnboardingRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/onboarding',
    requireAuthentication(),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    legacyValidateJsonBody(onboardingStateSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { completed, step } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const onboardingRepository = createOnboardingRepository({ db });

      const { member } = await organizationsRepository.getOrganizationMemberByUserId({ userId, organizationId });

      if (!member || !canManageOrganizationOnboarding(member)) {
        throw createForbiddenError();
      }

      await onboardingRepository.setOrganizationOnboarding({ organizationId, completed, step: step ?? null });

      return context.body(null, 204);
    },
  );
}
