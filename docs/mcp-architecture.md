# Papra MCP architecture

Papra's MCP integration follows the same layered shape as Dopost's MCP server:

1. `packages/mcp-server` owns the transport-independent server factory, REST API client, and tools.
2. Its `src/index.ts` provides a local stdio entrypoint and enables local-file tools.
3. `apps/mcp` exposes the same core through stateless Streamable HTTP and authenticates every request with a Papra API key.
4. The remote transport disables local-file tools and contains HTTP-only concerns such as CORS, allowed hosts, request IDs, health checks, and structured logs.

## Tool modules

Tools are grouped by Papra domain under `packages/mcp-server/src/tools`. Each module exports a `ToolRegistrar`, and `tools/index.ts` composes the registrars. Adding a domain therefore requires one module and one registry entry rather than expanding a central switch or transport implementation.

Tool handlers call Papra's public REST API. They do not import server repositories or database code, so local and hosted MCP deployments enforce the same API-key permissions and organization membership rules as every other integration.

## Authentication

The stdio server reads `PAPRA_API_KEY` from its process environment. The remote service accepts that same credential in the Bearer header, validates it against `/api/api-keys/current`, and creates a fresh REST client per MCP request. Credentials are never stored globally.

Papra does not currently expose an OAuth authorization server. The HTTP service therefore uses standard Bearer challenges without advertising OAuth discovery documents. OAuth can be introduced later in `apps/mcp` without changing the core or tools.

The public MCP server name is configured through `MCP_SERVER_NAME`; deployment URLs are environment-driven. A future SaaS rename therefore does not require changing tool modules or the transport layout.

## Compatibility

New tool inputs should be additive and optional. A breaking schema or behavior change should use a new tool name, while the old tool remains available during migration.
