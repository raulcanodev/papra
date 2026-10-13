# Papra MCP server

Transport-independent MCP core plus a local stdio entrypoint for Papra.

## Local usage

Build the package, then configure your MCP client to run `papra-mcp` with:

- `PAPRA_API_KEY`: a Papra API key.
- `PAPRA_API_URL`: optional API base URL; defaults to `https://api.papra.app`.
- `MCP_SERVER_NAME`: optional public MCP server name, so a future product rename does not require changing the tool architecture.

The local transport includes `upload_document`, because it is allowed to read a local path. The remote HTTP transport intentionally omits local-file tools.

## Adding tools

Create a domain module in `src/tools`, export a `ToolRegistrar`, then add it to the `toolModules` list in `src/tools/index.ts`. Keep transport, credentials, and HTTP lifecycle concerns outside tool modules.
