import { useLocation, useSearchParams } from '@solidjs/router';
import { createEffect, createSignal } from 'solid-js';

import { getReturnHref, isAppPath, RETURN_TO_SEARCH_PARAM, withReturnTo } from './return-to.models';

/** Links to another page that returns to the current one (path and search, so the open tab or filters come back too). */
export function useLinkWithReturn() {
  const location = useLocation();

  return (href: string) => withReturnTo({ href, returnTo: `${location.pathname}${location.search}` });
}

/** Where the page goes back to: the page it was opened from, or the fallback when opened directly. */
export function useReturnHref(fallback: () => string) {
  const [searchParams] = useSearchParams();

  return {
    returnHref: () => getReturnHref({ searchParam: searchParams[RETURN_TO_SEARCH_PARAM], fallback: fallback() }),
    // Keeps the origin on a link that stays in the same flow (the next file of a queue)
    keepReturnTo: (href: string) => (isAppPath(searchParams[RETURN_TO_SEARCH_PARAM]) ? withReturnTo({ href, returnTo: searchParams[RETURN_TO_SEARCH_PARAM] }) : href),
  };
}

// The settings are browsed through their own menu, so their back button returns to the last workspace page seen instead
const [lastWorkspacePath, setLastWorkspacePath] = createSignal<string | undefined>(undefined);

/** Called by the workspace layout: remembers the page shown so leaving the settings returns to it. */
export function useTrackWorkspacePath() {
  const location = useLocation();

  createEffect(() => setLastWorkspacePath(`${location.pathname}${location.search}`));
}

/** The last workspace page seen, when it is under the prefix (the same organization), or the fallback. */
export function useLastWorkspaceHref({ prefix, fallback }: { prefix?: () => string; fallback: () => string }) {
  return () => {
    const path = lastWorkspacePath();

    return path !== undefined && isAppPath(path) && (prefix === undefined || path.startsWith(prefix())) ? path : fallback();
  };
}
