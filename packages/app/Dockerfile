# Base stage with pnpm
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@10.30.3 --activate

# Build stage
FROM base AS build

WORKDIR /app

COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/paqui-client/package.json apps/paqui-client/package.json
COPY apps/paqui-server/package.json apps/paqui-server/package.json
COPY packages/webhooks/package.json packages/webhooks/package.json
COPY packages/lecture/package.json packages/lecture/package.json
COPY packages/search-parser/package.json packages/search-parser/package.json
COPY packages/tool-catalog/package.json packages/tool-catalog/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# The image is built on the production server: the client build is the memory peak (about 3.5 GB unbounded).
# A capped heap keeps it around 2 GB so it cannot take the whole machine and restart it mid-deploy.
RUN NODE_OPTIONS="--max-old-space-size=1536" pnpm --filter "@paqui/app-client..." run build && \
    pnpm --filter "@paqui/app-server..." run build

RUN pnpm deploy --filter=@paqui/app-server --legacy --prod /prod/paqui-server

FROM base

# Build arguments for version metadata
ARG PAPRA_VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

COPY --from=build /prod/paqui-server ./
COPY --from=build /app/apps/paqui-client/dist ./public

EXPOSE 1221

# Convert build args to environment variables for runtime
ENV PAPRA_VERSION=${PAPRA_VERSION}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}

ENV NODE_ENV=production
ENV SERVER_SERVE_PUBLIC_DIR=true
ENV DOCUMENT_STORAGE_FILESYSTEM_ROOT=./app-data/documents
ENV PAPRA_CONFIG_DIR=./app-data
ENV EMAILS_DRY_RUN=true
ENV CLIENT_BASE_URL=http://localhost:1221

# Disable Better Auth telemetry
ENV BETTER_AUTH_TELEMETRY=0

RUN mkdir -p ./app-data/documents ./ingestion

HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:1221/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["pnpm", "start:with-migrations"]
