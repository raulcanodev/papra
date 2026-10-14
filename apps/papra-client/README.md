# Papra - App Client

This is the server for [Papra](https://papra.app).

## Development

> [!IMPORTANT]
> Unless you are developing for the demo mode (`VITE_IS_DEMO_MODE=true` in adjacent `.env` file), you will need to have the server running locally. See the [server README](../papra-server/README.md) for instructions on how to start the server.

To start the development server, run:

```bash
# Navigate to the docs directory
cd apps/papra-client

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The development server will be available at [http://localhost:3000](http://localhost:3000).

## Public demo

The demo is the same client built with `VITE_IS_DEMO_MODE=true`. It never talks to a backend: an in-browser API mock (`src/modules/demo`) answers every request from `localStorage`, seeded with a fictional company (Acme SL) with customers, products, invoices, documents and a scripted AI assistant. Invoice PDFs are rendered in the browser.

```bash
pnpm build:demo   # outputs to dist-demo/
```

Build-time variables:

- `VITE_DEMO_FRAME_ANCESTORS`: origins allowed to embed the demo in an iframe (defaults to `https://heypaqui.com https://www.heypaqui.com http://localhost:* http://127.0.0.1:*`).
- `VITE_DEMO_SIGNUP_URL`: where the "Create free account" button in the demo points to (the real app's sign-up page).

The demo build ships a Content-Security-Policy (meta tag and `_headers`) that blocks every outgoing connection, so even a bug can't send data out.

To show it on the real app's landing page, build the real app with `VITE_DEMO_URL=<demo url>`: the hero then embeds the demo in a frame and the secondary button becomes "Try the live demo".
