import type { Component } from 'solid-js';
import { createEffect } from 'solid-js';
import { useSession } from '@/modules/auth/composables/use-session.composable';
import { isDemoMode } from '@/modules/config/config';
import { trackingServices } from '../tracking.services';

export const IdentifyUser: Component = () => {
  if (isDemoMode) {
    return null;
  }

  const { getUser, getImpersonation } = useSession();

  createEffect(() => {
    const user = getUser();

    // An admin visiting an account must not be counted as that user
    if (user && !getImpersonation()) {
      trackingServices.identify({
        userId: user.id,
        email: user.email,
      });
    }
  });

  return null;
};
