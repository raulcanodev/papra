# Paqui

Your business, finally in order: documents, invoices and finances in one calm workspace.

Live demo: [demo.heypaqui.com](https://demo.heypaqui.com) (no backend, client-side local storage only).

## Repository layout

- `apps/paqui-client` — web app (SolidJS + Vite), also builds the public demo.
- `apps/paqui-server` — API server (Hono + PostgreSQL).
- `apps/mcp` — remote MCP service.
- `apps/mobile` — mobile app (Expo).
- `packages/*` — shared packages (`@paqui/app`, `@paqui/api-sdk`, `@paqui/mcp-server`, …).
- `workers/*` — Cloudflare workers.

## Development

```bash
pnpm install
pnpm build:packages
pnpm --filter @paqui/app-server dev
pnpm --filter @paqui/app-client dev
```

## License

Paqui is a fork of [Papra](https://github.com/papra-hq/papra) by Corentin Thomasset, and like it is licensed under the [GNU AGPL v3](./LICENSE).
