import type { BetterAuthPlugin } from 'better-auth';
import type { Database } from '../../app/database/database.types';
import { APIError, createAuthEndpoint, createAuthMiddleware, freshSessionMiddleware, getIp, getSessionFromCtx } from 'better-auth/api';
import { deleteSessionCookie, setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import { getPermissionsForRoles } from '../../roles/roles.methods';
import { createRolesRepository } from '../../roles/roles.repository';
import { createLogger } from '../../shared/logger/logger';
import { isDefined, isNil } from '../../shared/utils';
import {
  IMPERSONATION_ADMIN_SESSION_COOKIE,
  IMPERSONATION_DURATION_MS,
  IMPERSONATION_REASON_MAX_LENGTH,
  IMPERSONATION_REASON_MIN_LENGTH,
} from './impersonation.constants';
import {
  canImpersonate,
  getImpersonationTargetError,
  isAuthPathForbiddenDuringImpersonation,
  isRequestAllowedDuringReadOnlyImpersonation,
  parseAdminSessionCookie,
  serializeAdminSessionCookie,
} from './impersonation.models';
import { createImpersonationsRepository } from './impersonation.repository';

const logger = createLogger({ namespace: 'impersonation' });

// The plugin's own fields are not part of the session type better-auth gives to plugin endpoints
function getImpersonatedBy({ session }: { session?: object | null }) {
  const impersonatedBy = (session as { impersonatedBy?: string | null } | null | undefined)?.impersonatedBy;

  return isNil(impersonatedBy) || impersonatedBy === '' ? undefined : impersonatedBy;
}

function getImpersonationCanWrite({ session }: { session?: object | null }) {
  return (session as { impersonationCanWrite?: boolean | null } | null | undefined)?.impersonationCanWrite === true;
}

// Lets an admin open a short session as another user from the admin panel, the way better-auth's
// admin plugin does, but with the permissions of our roles table, a mandatory reason, an audit
// trail, and the account-takeover routes closed for the length of the visit.
export function impersonationPlugin({ db }: { db: Database }) {
  const rolesRepository = createRolesRepository({ db });
  const impersonationsRepository = createImpersonationsRepository({ db });

  return {
    id: 'paqui-impersonation',

    schema: {
      session: {
        fields: {
          impersonatedBy: { type: 'string', required: false, input: false },
          impersonationCanWrite: { type: 'boolean', required: false, input: false, defaultValue: false },
        },
      },
    },

    endpoints: {
      startImpersonation: createAuthEndpoint(
        '/impersonation/start',
        {
          method: 'POST',
          // A session opened a long time ago (a forgotten tab) can't be used to enter accounts
          use: [freshSessionMiddleware],
          body: z.object({
            userId: z.string().min(1),
            reason: z.string().trim().min(IMPERSONATION_REASON_MIN_LENGTH).max(IMPERSONATION_REASON_MAX_LENGTH),
            // Read-only unless asked for when entering: nothing can be changed by mistake
            canWrite: z.boolean().optional().default(false),
          }),
        },
        async (ctx) => {
          const { session: adminSession, user: admin } = ctx.context.session;
          const { userId: targetUserId, reason, canWrite } = ctx.body;

          // No impersonation from inside an impersonation
          if (isDefined(getImpersonatedBy({ session: adminSession }))) {
            throw new APIError('FORBIDDEN', { message: 'Already impersonating a user' });
          }

          const { roles: adminRoles } = await rolesRepository.getUserRoles({ userId: admin.id });
          const { permissions } = getPermissionsForRoles({ roles: adminRoles });

          if (!canImpersonate({ permissions })) {
            logger.warn({ adminUserId: admin.id, targetUserId }, 'Impersonation refused: missing permission');
            throw new APIError('FORBIDDEN', { message: 'Not allowed to impersonate users' });
          }

          const targetUser = await ctx.context.internalAdapter.findUserById(targetUserId);

          if (!targetUser) {
            throw new APIError('NOT_FOUND', { message: 'User not found' });
          }

          const { roles: targetRoles } = await rolesRepository.getUserRoles({ userId: targetUser.id });
          const targetError = getImpersonationTargetError({ adminUserId: admin.id, targetUserId: targetUser.id, targetRoles });

          if (isDefined(targetError)) {
            logger.warn({ adminUserId: admin.id, targetUserId, targetError }, 'Impersonation refused');
            throw new APIError('FORBIDDEN', { message: targetError === 'self' ? 'Cannot impersonate yourself' : 'Cannot impersonate an admin' });
          }

          const expiresAt = new Date(Date.now() + IMPERSONATION_DURATION_MS);

          const session = await ctx.context.internalAdapter.createSession(
            targetUser.id,
            // "Don't remember me": a browser-session cookie that better-auth never refreshes
            true,
            { impersonatedBy: admin.id, impersonationCanWrite: canWrite, expiresAt },
            true,
          );

          if (isNil(session)) {
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to create the impersonation session' });
          }

          await impersonationsRepository.recordImpersonationStart({
            impersonation: {
              adminUserId: admin.id,
              targetUserId: targetUser.id,
              adminEmail: admin.email,
              targetEmail: targetUser.email,
              reason,
              canWrite,
              sessionId: session.id,
              ipAddress: isDefined(ctx.request) ? getIp(ctx.request, ctx.context.options) : null,
              userAgent: ctx.headers?.get('user-agent') ?? null,
              expiresAt,
            },
          });

          logger.info({ adminUserId: admin.id, targetUserId: targetUser.id, sessionId: session.id, canWrite }, 'Impersonation started');

          // The admin's own session is kept aside, signed, to come back to it afterwards
          const dontRememberMe = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
          const adminCookie = ctx.context.createAuthCookie(IMPERSONATION_ADMIN_SESSION_COOKIE);
          await ctx.setSignedCookie(
            adminCookie.name,
            serializeAdminSessionCookie({ token: adminSession.token, dontRememberMe: isDefined(dontRememberMe) && dontRememberMe !== false }),
            ctx.context.secret,
            ctx.context.authCookies.sessionToken.options,
          );

          await setSessionCookie(ctx, { session, user: targetUser }, true);

          return ctx.json({ expiresAt });
        },
      ),

      stopImpersonation: createAuthEndpoint(
        '/impersonation/stop',
        { method: 'POST', requireHeaders: true },
        async (ctx) => {
          const adminCookieName = ctx.context.createAuthCookie(IMPERSONATION_ADMIN_SESSION_COOKIE).name;
          const adminCookieValue = await ctx.getSignedCookie(adminCookieName, ctx.context.secret);
          const adminCookie = typeof adminCookieValue === 'string' ? parseAdminSessionCookie({ value: adminCookieValue }) : undefined;

          const current = await getSessionFromCtx(ctx);
          const impersonatedBy = getImpersonatedBy({ session: current?.session });

          // A regular session never gets swapped, whatever cookie comes with it
          if (current && isNil(impersonatedBy)) {
            ctx.setCookie(adminCookieName, '', { ...ctx.context.authCookies.sessionToken.options, maxAge: 0 });
            throw new APIError('BAD_REQUEST', { message: 'Not impersonating anyone' });
          }

          if (current && isDefined(impersonatedBy)) {
            await ctx.context.internalAdapter.deleteSession(current.session.token);
            await impersonationsRepository.recordImpersonationEnd({ sessionId: current.session.id });
            logger.info({ adminUserId: impersonatedBy, targetUserId: current.user.id, sessionId: current.session.id }, 'Impersonation stopped');
          }

          ctx.setCookie(adminCookieName, '', { ...ctx.context.authCookies.sessionToken.options, maxAge: 0 });

          const adminSession = isDefined(adminCookie) ? await ctx.context.internalAdapter.findSession(adminCookie.token) : null;

          const canRestoreAdmin = isDefined(adminSession)
            && adminSession.session.expiresAt.getTime() > Date.now()
            // The impersonation must have been opened by the owner of the kept session
            && (isNil(impersonatedBy) || adminSession.user.id === impersonatedBy);

          if (!canRestoreAdmin) {
            deleteSessionCookie(ctx);
            return ctx.json({ restored: false });
          }

          await setSessionCookie(ctx, adminSession, adminCookie?.dontRememberMe ?? false);

          return ctx.json({ restored: true });
        },
      ),
    },

    hooks: {
      before: [
        {
          matcher: context => isAuthPathForbiddenDuringImpersonation({ path: context.path }),
          handler: createAuthMiddleware(async (ctx) => {
            const current = await getSessionFromCtx(ctx);
            const impersonatedBy = getImpersonatedBy({ session: current?.session });

            if (current && isDefined(impersonatedBy)) {
              logger.warn({ adminUserId: impersonatedBy, targetUserId: current.user.id, path: ctx.path }, 'Blocked auth action during impersonation');
              throw new APIError('FORBIDDEN', { message: 'Not available while impersonating a user' });
            }
          }),
        },
        {
          // The auth routes are answered before the app's own read-only guard, so they get theirs here
          matcher: context => !isRequestAllowedDuringReadOnlyImpersonation({ method: context.request?.method ?? 'GET', authPath: context.path }),
          handler: createAuthMiddleware(async (ctx) => {
            const current = await getSessionFromCtx(ctx);
            const impersonatedBy = getImpersonatedBy({ session: current?.session });

            if (current && isDefined(impersonatedBy) && !getImpersonationCanWrite({ session: current.session })) {
              logger.warn({ adminUserId: impersonatedBy, targetUserId: current.user.id, path: ctx.path }, 'Blocked auth action during read-only impersonation');
              throw new APIError('FORBIDDEN', { message: 'This impersonation is read-only', code: 'auth.impersonation_read_only' });
            }
          }),
        },
        {
          // Signing out of an impersonation closes its audit row
          matcher: context => context.path === '/sign-out',
          handler: createAuthMiddleware(async (ctx) => {
            const current = await getSessionFromCtx(ctx);

            if (current && isDefined(getImpersonatedBy({ session: current.session }))) {
              await impersonationsRepository.recordImpersonationEnd({ sessionId: current.session.id });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
