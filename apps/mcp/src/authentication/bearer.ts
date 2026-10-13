const MAX_BEARER_TOKEN_LENGTH = 4096;

export function readBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1];
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH) {
    return undefined;
  }

  return token;
}

export function bearerChallenge(error?: 'invalid_token'): string {
  const parameters = ['realm="papra-mcp"'];
  if (error) {
    parameters.push(`error="${error}"`);
  }
  return `Bearer ${parameters.join(', ')}`;
}
