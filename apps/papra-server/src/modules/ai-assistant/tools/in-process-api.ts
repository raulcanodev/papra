import type { ApiRequester, HttpMethod } from '@papra/tool-catalog';
import type { ServerInstance } from '../../app/server.types';

export class InProcessApiError extends Error {
  public constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'InProcessApiError';
  }
}

// Headers that carry who the user is. Forwarding them makes the call the user's own: same session, same membership
// checks, same validations as when the web app calls the endpoint, with nothing duplicated in the assistant.
const FORWARDED_HEADERS = ['cookie', 'authorization', 'origin', 'x-forwarded-for', 'user-agent'] as const;

export function createInProcessApiRequester({ app, requestHeaders, env }: {
  app: ServerInstance;
  requestHeaders: Headers;
  /** Bindings of the current request (the test server reads the logged in user from them) */
  env?: unknown;
}): ApiRequester {
  const forwarded = new Headers();

  for (const name of FORWARDED_HEADERS) {
    const value = requestHeaders.get(name);

    if (value !== null) {
      forwarded.set(name, value);
    }
  }

  return {
    request: async <T>(method: HttpMethod, path: string, body?: unknown): Promise<T> => {
      if (!path.startsWith('/api/')) {
        throw new Error(`Invalid API path: ${path}`);
      }

      const headers = new Headers(forwarded);
      headers.set('x-papra-source', 'assistant');

      if (body !== undefined) {
        headers.set('content-type', 'application/json');
      }

      const response = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env as never);

      if (response.status === 204) {
        return {} as T;
      }

      const payload: unknown = (response.headers.get('content-type') ?? '').includes('application/json') ? await response.json() : await response.text();

      if (!response.ok) {
        throw new InProcessApiError(extractErrorMessage(payload) ?? `Request failed with status ${response.status}`, response.status);
      }

      return payload as T;
    },
  };
}

// The API answers { error: { code, message } }, sometimes a flat { message } or a plain string
function extractErrorMessage(payload: unknown) {
  if (typeof payload === 'string' && payload !== '') {
    return payload;
  }

  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }

  const { error, message } = payload as { error?: unknown; message?: unknown };

  if (typeof message === 'string') {
    return message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error !== null && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  return undefined;
}
