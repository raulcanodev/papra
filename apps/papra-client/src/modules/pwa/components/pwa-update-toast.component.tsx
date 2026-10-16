import type { Component } from 'solid-js';
import { createEffect, on } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createToast } from '@/modules/ui/components/sonner';
import { applyServiceWorkerUpdate, getWaitingWorker } from '../pwa.service-worker';

// A new build is ready: the member reloads when it suits them
export const PwaUpdateToast: Component = () => {
  const { t } = useI18n();

  createEffect(on(getWaitingWorker, (waitingWorker) => {
    if (!waitingWorker) {
      return;
    }

    createToast({
      message: t('pwa.update.message'),
      id: 'pwa-update',
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: t('pwa.update.reload'),
        onClick: applyServiceWorkerUpdate,
      },
    });
  }));

  return null;
};
