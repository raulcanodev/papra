import { useQuery } from '@tanstack/solid-query';
import { createEffect } from 'solid-js';
import { getSession } from '../auth.services';
import { writeSessionHint } from '../session-hint';

export function useSession() {
  const sessionQuery = useQuery(() => ({
    queryKey: ['auth', 'session'],
    queryFn: () => getSession(),
  }));

  const getUser = () => sessionQuery.data?.data?.user;
  const getIsAuthenticated = () => Boolean(getUser());
  // Set when an admin opened this session from the admin panel to act as the user
  const getImpersonation = () => {
    const session = sessionQuery.data?.data?.session as { impersonatedBy?: string | null; impersonationCanWrite?: boolean | null; expiresAt: Date } | undefined;

    return session?.impersonatedBy
      ? { impersonatedBy: session.impersonatedBy, canWrite: session.impersonationCanWrite === true, expiresAt: new Date(session.expiresAt) }
      : undefined;
  };

  // Remember the outcome so the next visit knows what to show before the session is fetched
  createEffect(() => {
    if (sessionQuery.isSuccess) {
      writeSessionHint({ hasSession: getIsAuthenticated() });
    }
  });

  return {
    sessionQuery,
    getUser,
    getIsAuthenticated,
    getImpersonation,
  };
}
