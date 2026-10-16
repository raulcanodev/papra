# Paqui MCP server

Transport-independent MCP core plus a local stdio entrypoint for Paqui.

## Local usage

Build the package, then configure your MCP client to run `paqui-mcp` with:

- `PAPRA_API_KEY`: a Paqui API key.
- `PAPRA_API_URL`: optional API base URL; defaults to `https://api.heypaqui.com`.
- `MCP_SERVER_NAME`: optional public MCP server name, so a future product rename does not require changing the tool architecture.

The local transport includes `upload_document`, because it is allowed to read a local path. The remote HTTP transport intentionally omits local-file tools.

## Tools

The tools come from the shared catalog (`@paqui/tool-catalog`, see its README for the complete list with risk level and API key permission): organizations, workspace search, documents, tags, contacts (customers, suppliers, sales representatives), products and tax rates, issued invoices, received invoices, fiscal profile, quarterly taxes, fiscal calendar and a Spanish tax reference. Each tool needs the matching API key permission, so a key can be limited to read-only.

## Adding tools

Add the definition to the catalog (`packages/tool-catalog/src/domains`) and register it in `src/catalog.ts`: this server and the in-app assistant both pick it up. Only tools that cannot go through the REST API (like `upload_document`, which reads a local path) live here, in `src/tools`. Keep transport, credentials, and HTTP lifecycle concerns outside tool modules.
