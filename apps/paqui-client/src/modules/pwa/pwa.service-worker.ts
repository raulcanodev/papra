import { createSignal } from 'solid-js';

// The service worker keeps the shell of the app for a fast start and makes it installable.
// A new build waits until the member chooses to reload: nobody loses a half filled invoice to an update.

const [getWaitingWorker, setWaitingWorker] = createSignal<ServiceWorker>();
let hasRequestedUpdate = false;

export { getWaitingWorker };

function watchForUpdates(registration: ServiceWorkerRegistration) {
  // The very first worker is no update: only a worker arriving while another one controls the page is
  if (registration.waiting && navigator.serviceWorker.controller) {
    setWaitingWorker(registration.waiting);
  }

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;

    installingWorker?.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        setWaitingWorker(installingWorker);
      }
    });
  });
}

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only the reload the member asked for: never right after the first installation
    if (hasRequestedUpdate) {
      window.location.reload();
    }
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      watchForUpdates(registration);

      // An installed app can stay open for days: look for a new build whenever it comes back to the screen
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  });
}

export function applyServiceWorkerUpdate() {
  const waitingWorker = getWaitingWorker();

  if (!waitingWorker) {
    return;
  }

  hasRequestedUpdate = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}
