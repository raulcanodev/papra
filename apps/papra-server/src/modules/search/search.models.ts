import { SEARCH_KINDS } from '@papra/tool-catalog';

export { SEARCH_KINDS };
export type SearchKind = typeof SEARCH_KINDS[number];

// What a kind needs for an API key to be allowed to see it: searching must never reveal what the key cannot read
export const SEARCH_KIND_READ_PERMISSION = {
  contact: 'contacts:read',
  invoice: 'invoices:read',
  purchase_invoice: 'purchases:read',
  product: 'products:read',
  document: 'documents:read',
} as const satisfies Record<SearchKind, string>;

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  /** The field that contained the text, so the reader understands why it matched */
  matchedOn: string;
};

// LIKE treats % and _ as wildcards: the user text is searched literally
export function buildContainsPattern({ query }: { query: string }) {
  return `%${query.trim().replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

export function findMatchedField({ query, fields }: { query: string; fields: Record<string, string | null | undefined> }) {
  const needle = query.trim().toLowerCase();

  return Object.entries(fields).find(([, value]) => value?.toLowerCase().includes(needle) === true)?.[0];
}

export function parseSearchKinds({ kinds }: { kinds: string | undefined }): SearchKind[] {
  if (kinds === undefined || kinds === '') {
    return [...SEARCH_KINDS];
  }

  return SEARCH_KINDS.filter(kind => kinds.split(',').map(item => item.trim()).includes(kind));
}

export function filterKindsByPermissions({ kinds, apiKeyPermissions }: { kinds: SearchKind[]; apiKeyPermissions: readonly string[] | undefined }) {
  // A session (undefined) sees everything its user can see
  if (apiKeyPermissions === undefined) {
    return kinds;
  }

  return kinds.filter(kind => apiKeyPermissions.includes(SEARCH_KIND_READ_PERMISSION[kind]));
}
