// Helpers shared by the tools to build API paths and bodies

export function segment(value: string): string {
  return encodeURIComponent(value);
}

export function organizationPath(organizationId: string, suffix = ''): string {
  return `/api/organizations/${segment(organizationId)}${suffix}`;
}

type QueryValue = string | number | boolean | undefined | null;

export function withQuery(path: string, query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();
  return serialized === '' ? path : `${path}?${serialized}`;
}

export function withoutUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map(key => [key, value[key]])) as Pick<T, K>;
}
