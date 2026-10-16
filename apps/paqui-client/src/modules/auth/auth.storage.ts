const REMEMBER_EMAIL_PREFERENCE_KEY = 'paqui.auth.remember-email';
const REMEMBERED_EMAIL_KEY = 'paqui.auth.remembered-email';

type AuthStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function readRememberedLogin({ storage = localStorage }: { storage?: AuthStorage } = {}) {
  const preference = storage.getItem(REMEMBER_EMAIL_PREFERENCE_KEY);

  return {
    email: storage.getItem(REMEMBERED_EMAIL_KEY) ?? '',
    // Preserve the existing checked-by-default behaviour for first-time visitors.
    rememberMe: preference === null ? true : preference === 'true',
  };
}

export function writeRememberedLogin({
  email,
  rememberMe,
  storage = localStorage,
}: {
  email: string;
  rememberMe: boolean;
  storage?: AuthStorage;
}) {
  storage.setItem(REMEMBER_EMAIL_PREFERENCE_KEY, String(rememberMe));

  if (rememberMe) {
    storage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
    return;
  }

  storage.removeItem(REMEMBERED_EMAIL_KEY);
}
