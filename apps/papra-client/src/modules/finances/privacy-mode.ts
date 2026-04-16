import { createSignal } from 'solid-js';

const STORAGE_KEY = 'papra-privacy-mode';

function getInitialValue(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }
  catch {
    return false;
  }
}

const [isPrivacyMode, setIsPrivacyModeInternal] = createSignal(getInitialValue());

export function usePrivacyMode() {
  function togglePrivacyMode() {
    const next = !isPrivacyMode();
    setIsPrivacyModeInternal(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  return { isPrivacyMode, togglePrivacyMode };
}

export function maskDigits(text: string): string {
  return text.replace(/\d/g, '*');
}

export function privacyText(text: string, privacyEnabled: boolean): string {
  if (!privacyEnabled) {
    return text;
  }
  return text.replace(/\S/g, '*');
}

export function privacyCurrency(formatted: string, privacyEnabled: boolean): string {
  if (!privacyEnabled) {
    return formatted;
  }
  return maskDigits(formatted);
}
