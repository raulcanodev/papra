FROM node:22.23.4-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
COPY packages/tool-catalog/package.json packages/tool-catalog/package.json
RUN pnpm install --frozen-lockfile --filter @paqui/mcp...

COPY apps/mcp apps/mcp
COPY packages/mcp-server packages/mcp-server
COPY packages/tool-catalog packages/tool-catalog
RUN pnpm --filter @paqui/tool-catalog build && pnpm --filter @paqui/mcp-server build && pnpm --filter @paqui/mcp build

FROM node:22.23.4-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
COPY packages/tool-catalog/package.json packages/tool-catalog/package.json
RUN pnpm install --frozen-lockfile --prod --filter @paqui/mcp...

COPY --from=build /app/apps/mcp/dist apps/mcp/dist
COPY --from=build /app/packages/mcp-server/dist packages/mcp-server/dist
COPY --from=build /app/packages/tool-catalog/dist packages/tool-catalog/dist

EXPOSE 3100
CMD ["node", "apps/mcp/dist/index.js"]
