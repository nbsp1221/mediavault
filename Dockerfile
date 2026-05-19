# Stage 1: Base image with Bun
FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Install dependencies needed for native modules and media tool downloads
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    linux-libc-dev \
    dumb-init \
    curl \
    bash \
    ca-certificates \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: Development dependencies
FROM base AS development-dependencies
# Copy package files for better caching
COPY package.json bun.lock ./
COPY scripts/verify-bun-version.ts ./scripts/verify-bun-version.ts
RUN bun install --frozen-lockfile

# Stage 3: Production dependencies  
FROM base AS production-dependencies
COPY package.json bun.lock ./
COPY scripts/verify-bun-version.ts ./scripts/verify-bun-version.ts
RUN bun install --frozen-lockfile

# Stage 4: Build stage
FROM base AS build
COPY package.json bun.lock ./
COPY --from=development-dependencies /app/node_modules ./node_modules
COPY . .
# Download media tool binaries during build
RUN bash scripts/download-ffmpeg.sh && bash scripts/download-shaka-packager.sh
RUN bun run build

# Stage 5: Production image  
FROM oven/bun:1.3.5 AS production

# Note: Using existing 'bun' user (UID/GID 1000) from base image
# This matches common host user configuration and avoids permission issues

# Set working directory
WORKDIR /app

# Copy package files and production dependencies
COPY --chown=bun:bun package.json bun.lock ./
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=bun:bun /app/build ./build

# Copy media tool binaries
COPY --from=build --chown=bun:bun /app/binaries ./binaries

# Create necessary directories with proper ownership
RUN mkdir -p storage/videos storage/staging && \
    chown -R bun:bun storage

# Switch to non-root user
USER bun

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV MEDIAVAULT_STORAGE_DIR=/app/storage

# Health check using bun
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run server with react-router-serve (same as local)
CMD ["bun", "run", "start"]
