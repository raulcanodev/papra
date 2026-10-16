# Paqui MCP architecture

Paqui's MCP integration follows the same layered shape as Dopost's MCP server:

1. `packages/mcp-server` owns the transport-independent server factory, REST API client, and tools.
2. Its `src/index.ts` provides a local stdio entrypoint and enables local-file tools.
3. `apps/mcp` exposes the same core through stateless Streamable HTTP and authenticates every request with a Paqui API key.
4. The remote transport disables local-file tools and contains HTTP-only concerns such as CORS, allowed hosts, request IDs, health checks, and structured logs.

## Tool catalog

Tools are defined once in `packages/tool-catalog` (see its README for the full list) and consumed by two transports:

- the MCP server registers every definition and runs it over HTTP with the API key (`packages/mcp-server/src/tools/catalog.ts`);
- the in-app assistant runs the same definitions in-process with the user's session; reads run right away, writes and destructive actions become approval cards (`apps/paqui-server/src/modules/ai-assistant/tools/catalog-tools.ts`).

A definition holds the name, the description written for the model, the zod input, a risk level (`read`, `write`, `destructive`), the API key permission it needs and a `run` function that only talks to Paqui's public REST API. Adding a tool is one definition in `src/domains` plus an entry in `src/catalog.ts`; both transports pick it up. Tools take and return human units (euros, percentages) and convert to the API's cents and basis points at the edge.

Handlers never import server repositories or database code, so MCP, assistant and web app enforce the same API-key permissions and organization membership rules. The only tool outside the catalog is `upload_document`, which reads a local path and exists for the stdio transport only.

The permissions an API key can carry are declared in the catalog too (`API_KEY_PERMISSIONS`), and the API routes that tools use open themselves to API keys with `requireAuthentication({ apiKeyPermissions })`.

## Authentication

The stdio server reads `PAPRA_API_KEY` from its process environment. The remote service accepts that same credential in the Bearer header, validates it against `/api/api-keys/current`, and creates a fresh REST client per MCP request. Credentials are never stored globally.

Paqui does not currently expose an OAuth authorization server. The HTTP service therefore uses standard Bearer challenges without advertising OAuth discovery documents. OAuth can be introduced later in `apps/mcp` without changing the core or tools.

The public MCP server name is configured through `MCP_SERVER_NAME`; deployment URLs are environment-driven. A future SaaS rename therefore does not require changing tool modules or the transport layout.

## Compatibility

New tool inputs should be additive and optional. A breaking schema or behavior change should use a new tool name, while the old tool remains available during migration.
