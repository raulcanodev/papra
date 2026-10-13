export interface McpHttpConfig {
  host: string;
  port: number;
  apiUrl: string;
  apiTimeoutMs: number;
  serverName: string;
  allowedHosts?: string[];
  allowedOrigins: ReadonlySet<string>;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): McpHttpConfig {
  return {
    host: environment.HOST?.trim() || '0.0.0.0',
    port: parsePositiveInteger(environment.PORT, 3100, 'PORT'),
    apiUrl: environment.PAPRA_API_URL?.trim() || 'https://api.papra.app',
    apiTimeoutMs: parsePositiveInteger(environment.PAPRA_API_TIMEOUT_MS, 30_000, 'PAPRA_API_TIMEOUT_MS'),
    serverName: environment.MCP_SERVER_NAME?.trim() || 'papra',
    allowedHosts: parseList(environment.MCP_ALLOWED_HOSTS),
    allowedOrigins: new Set(parseList(environment.MCP_ALLOWED_ORIGINS) ?? []),
  };
}

function parseList(value: string | undefined): string[] | undefined {
  const values = value
    ?.split(',')
    .map(item => item.trim())
    .filter(Boolean);

  return values?.length ? values : undefined;
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number, name: string): number {
  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}
