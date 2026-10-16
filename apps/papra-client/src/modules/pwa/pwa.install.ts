import { createSignal } from 'solid-js';
import { isIosDevice, isStandaloneDisplay } from './pwa.models';

// Chrome, Edge and the Android browsers offer the installation once, early, through this event:
// it is kept from the start so the install button of the settings works whenever the member gets there
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const [getInstallPrompt, setInstallPrompt] = createSignal<BeforeInstallPromptEvent>();
const [getIsInstalled, setIsInstalled] = createSignal(false);

function readIsStandalone() {
  return isStandaloneDisplay({
    matchesStandaloneMedia: window.matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  });
}

export function listenForInstallPrompt() {
  if (typeof window === 'undefined') {
    return;
  }

  setIsInstalled(readIsStandalone());

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keeps the browser's own banner away: the app offers the installation where it makes sense
    event.preventDefault();
    setInstallPrompt(event as BeforeInstallPromptEvent);
  });

  window.addEventListener('appinstalled', () => {
    setIsInstalled(true);
    setInstallPrompt(undefined);
  });
}

export function usePwaInstall() {
  return {
    /** Running from its icon, in its own window */
    isInstalled: getIsInstalled,
    /** The browser lets the app open its installation dialog: one click */
    canPromptInstall: () => getInstallPrompt() !== undefined,
    /** Safari on iOS never offers it: the member adds it from the share menu */
    isIos: () => isIosDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
    promptInstall: async () => {
      const installPrompt = getInstallPrompt();

      if (!installPrompt) {
        return { isAccepted: false };
      }

      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      // The event can be used once: the browser fires a new one if the member may try again
      setInstallPrompt(undefined);

      return { isAccepted: outcome === 'accepted' };
    },
  };
}
