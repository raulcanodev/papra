export interface ApiKeyContext {
  id: string;
  name: string;
  permissions: string[];
}

export interface PapraApiClient {
  authenticate: () => Promise<ApiKeyContext>;
  request: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;
  requestForm: <T = unknown>(method: string, path: string, body: FormData) => Promise<T>;
}

export interface RestPapraApiClientOptions {
  apiUrl: string;
  apiKey: string;
  requestId?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class PapraApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PapraApiError';
  }
}

export class RestPapraApiClient implements PapraApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly requestId?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  public constructor(options: RestPapraApiClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.requestId = options.requestId;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  public async authenticate(): Promise<ApiKeyContext> {
    const response = await this.request<{ apiKey: ApiKeyContext }>('GET', '/api/api-keys/current');
    return response.apiKey;
  }

  public request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    return this.requestRaw<T>(method, path, body === undefined
      ? undefined
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        });
  }

  public requestForm<T = unknown>(method: string, path: string, body: FormData): Promise<T> {
    return this.requestRaw<T>(method, path, { body });
  }

  private async requestRaw<T>(
    method: string,
    path: string,
    options?: { body: BodyInit; headers?: Record<string, string> },
  ): Promise<T> {
    const safeRequestPath = safePath(path);
    const response = await this.fetchFn(`${this.apiUrl}${safeRequestPath}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'x-papra-source': 'mcp',
        ...(this.requestId ? { 'x-request-id': this.requestId } : {}),
        ...options?.headers,
      },
      body: options?.body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = response.status === 204
      ? undefined
      : contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
      throw new PapraApiError(
        extractErrorMessage(responseBody) ?? `Papra API request failed with status ${response.status}`,
        response.status,
        responseBody,
      );
    }

    return (responseBody ?? {}) as T;
  }
}

export function safePath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error(`Invalid Papra API path: ${path}`);
  }

  return path;
}

function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const error = record.error;

    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
      return (error as Record<string, string>).message;
    }

    if (typeof record.message === 'string') {
      return record.message;
    }
  }

  return undefined;
}
