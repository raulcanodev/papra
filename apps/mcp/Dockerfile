FROM node:22-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
RUN pnpm install --frozen-lockfile --filter @papra/mcp...

COPY apps/mcp apps/mcp
COPY packages/mcp-server packages/mcp-server
RUN pnpm --filter @papra/mcp-server build && pnpm --filter @papra/mcp build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
RUN pnpm install --frozen-lockfile --prod --filter @papra/mcp...

COPY --from=build /app/apps/mcp/dist apps/mcp/dist
COPY --from=build /app/packages/mcp-server/dist packages/mcp-server/dist

EXPOSE 3100
CMD ["node", "apps/mcp/dist/index.js"]
