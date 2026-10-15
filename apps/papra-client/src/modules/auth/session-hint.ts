// Whether this browser had a session the last time it checked. It only decides what to show while the real
// session is being fetched: the landing and the sign in pages for visitors (instantly, no loader), the app loader
// for members. Never used for access control. The key is also read by the inline script of index.html.
export const SESSION_HINT_STORAGE_KEY = 'papra.auth.has-session';

type HintStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readSessionHint({ storage = globalThis.localStorage }: { storage?: HintStorage } = {}) {
  try {
    return storage.getItem(SESSION_HINT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSessionHint({ hasSession, storage = globalThis.localStorage }: { hasSession: boolean; storage?: HintStorage }) {
  try {
    if (hasSession) {
      storage.setItem(SESSION_HINT_STORAGE_KEY, 'true');
    } else {
      storage.removeItem(SESSION_HINT_STORAGE_KEY);
    }
  } catch {
    // Blocked storage: the app still works, visitors just see the loader for a moment
  }
}
