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
  };
}
