# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS build
# Tools to build better-sqlite3 when no prebuilt binary is available
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS run
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app /app
RUN chmod -R a+rX /app
RUN mkdir -p /app/data /app/logs && chown -R node:node /app/data /app/logs
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
