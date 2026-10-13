# Papra remote MCP

Stateless Streamable HTTP transport for `@papra/mcp-server`.

## Configuration

- `PORT` and `HOST`: listener settings; defaults to `3100` and `0.0.0.0`.
- `PAPRA_API_URL`: Papra API base URL.
- `PAPRA_API_TIMEOUT_MS`: upstream timeout, default `30000`.
- `MCP_SERVER_NAME`: public MCP server name, default `papra`.
- `MCP_ALLOWED_HOSTS`: optional comma-separated host allowlist.
- `MCP_ALLOWED_ORIGINS`: optional comma-separated browser-origin allowlist.

Clients send their Papra API key as `Authorization: Bearer ...`. Every MCP request gets its own authenticated API client and stateless transport. `/health` is public; `/` and `/mcp` are MCP endpoints.

Papra currently supports API keys rather than an OAuth authorization server, so this service deliberately does not publish OAuth discovery metadata. OAuth can be added at the transport boundary later without changing tool modules.
