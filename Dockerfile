FROM node:26.13.0-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@12.16.1

FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl bash ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
COPY scripts/verify-runtime.mts ./scripts/verify-runtime.mts
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm download:ffmpeg && pnpm download:shaka
RUN pnpm build
RUN pnpm prune --prod

FROM node:26.13.0-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV MEDIAVAULT_STORAGE_DIR=/app/storage
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/binaries ./binaries
RUN mkdir -p storage/videos storage/staging && chown -R node:node storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "./server.mjs"]
