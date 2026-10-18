// A page opened from somewhere else (a contact, the calendar, the due dates) carries where it was opened from,
// so its back button and what follows a save return there instead of to its own list
export const RETURN_TO_SEARCH_PARAM = 'from';

// Only a path of this app: an absolute URL or a protocol relative one ("//host") would leave it
export function isAppPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\');
}

export function withReturnTo({ href, returnTo }: { href: string; returnTo: string }) {
  const [path = '', query = ''] = href.split('?');
  const search = new URLSearchParams(query);
  search.set(RETURN_TO_SEARCH_PARAM, returnTo);

  return `${path}?${search.toString()}`;
}

export function getReturnHref({ searchParam, fallback }: { searchParam: unknown; fallback: string }) {
  return isAppPath(searchParam) ? searchParam : fallback;
}
