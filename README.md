# Mediavault

Self-hosted encrypted media streaming vault for browsing, uploading, and protecting personal media through a web interface. Built with React Router v7 and pure Bun runtime.

## Features

- 🎬 Stream local media files through a web browser
- 🔐 SQLite-backed account login with httpOnly site sessions
- 📁 Browser-first upload with staged commit into the library
- 🔒 Protected DASH playback with JWT tokens, ClearKey, and encrypted media packaging
- 🎨 YouTube-inspired UI for video browsing
- ⚡ Pure Bun runtime for maximum performance

## Getting Started

### Development

```bash
# Install dependencies
bun install

# Create local environment config
cp .env.example .env

# Create the first login account
bun run auth:add-user

# Start development server
bun run dev
```

Access at http://localhost:5173

`bun run dev` is for trusted local development only. Do not expose the Vite
development server through a public tunnel, reverse proxy, or untrusted LAN. Use
`bun run build` and `bun run start`, or the Docker production image, for
deployment. When `STORAGE_DIR` is not set, development runtime storage defaults
to a checkout-specific directory outside this repository so Vite cannot serve
runtime media, keys, or SQLite data from the project root.

### Production

```bash
# Build application
bun run build

# Start production server
bun start
```

Create login accounts with `bun run auth:add-user`; remove them with
`bun run auth:delete-user`. For protected playback routes, set `VIDEO_JWT_SECRET`.
For ingest and encrypted playback packaging, also set `VIDEO_MASTER_ENCRYPTION_SEED`.
When `NODE_ENV=production`, Mediavault runs a startup preflight and refuses to start
without the full vault requirements: at least one auth account in the primary SQLite
database, `VIDEO_JWT_SECRET`, `VIDEO_MASTER_ENCRYPTION_SEED`, and usable configured
storage.

## Docker Deployment

### Published GHCR Image

Mediavault publishes production images to GitHub Container Registry after verified
`main` pushes. Pulling and restarting the service on a host is an operator-owned
deployment step.

```bash
docker pull ghcr.io/nbsp1221/mediavault:latest
```

The current checked-in `docker-compose.yaml` remains a local source-build path. Do not
use `docker compose pull` as the GHCR image update path until a future Compose migration
changes that file to consume the published image.

### Local Source-Build Compose

```bash
# Start the application
docker-compose up -d

# Access at http://localhost:3000
```

For remote browser use, run the container behind an HTTPS reverse proxy. Production auth
cookies are secure cookies, so plain remote HTTP is not a complete production deployment.
Reverse proxy routing, TLS certificates, firewall rules, and public port exposure are
operator-owned infrastructure responsibilities.

### Features

✅ **Pure Bun runtime** - Fast, modern JavaScript runtime  
✅ **Security hardened** - Non-root user, minimal capabilities  
✅ **Health monitoring** - Auto-restart on failure  
✅ **Persistent storage** - Data and videos preserved  

Docker healthchecks use `GET /health/ready`. The endpoint returns `204 No Content` only
when the production full-vault readiness checks pass, and `503 Service Unavailable` with
no diagnostic body when they fail. Detailed causes are written to container logs.

### Volumes

The app writes to `/app/storage` inside the container.

By default, Docker Compose backs that path with the named volume
`mediavault-storage`. If you want the files to appear in this checkout, set
`MEDIAVAULT_STORAGE_MOUNT=./storage` in `.env` before running Compose.

- named volume: Docker-managed storage with fewer host permission issues
- bind mount: host-visible files, but host ownership and write permissions matter

Storage layout:

```text
storage/db.sqlite
storage/videos/
storage/staging/
```

The production image provisions FFmpeg, ffprobe, and Shaka Packager for browser upload
commit and encrypted DASH packaging.

### Commands

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Environment

Create `.env` file before starting the app:

```bash
cp .env.example .env
```

Required for the full vault feature set:

- `VIDEO_JWT_SECRET`: signing secret for protected playback token issuance
- `VIDEO_MASTER_ENCRYPTION_SEED`: master seed for deriving per-video encryption keys
- at least one SQLite auth account created with `bun run auth:add-user`

Generate deployment-specific secret values before starting the full vault path. The
encryption seed and playback JWT secret are free-form strings, but they should be
cryptographically random. They do not need to be hex-encoded.

In production, both secret values must be present and non-blank before the app starts.
Runtime preflight does not score secret strength, so weak values are an operator mistake,
not something the app can reliably fix at startup.

```bash
openssl rand -base64 32
bun -e "const { randomBytes } = await import('node:crypto'); console.log(randomBytes(32).toString('base64url'))"
```

Optional:

- `KEY_SALT_PREFIX`: salt prefix used during playback key derivation
- `STORAGE_DIR`: override the unified storage root for `db.sqlite`, committed media, and staged uploads
- `DATABASE_SQLITE_PATH`: override path for the primary SQLite database without moving media artifacts
- `MEDIAVAULT_STORAGE_MOUNT`: Docker Compose storage mount source for `/app/storage`
- `AUTH_CLIENT_COOKIE_NAME`: override the client identity cookie name
- `AUTH_SESSION_COOKIE_NAME`: override the auth session cookie name
- `AUTH_SESSION_TTL_MS`: session lifetime in milliseconds
- `AUTH_TRUST_PROXY_HEADERS`: trust forwarded client IP headers for rate limiting
- `AUTH_FAILED_LOGIN_BLOCK_DURATION_MS`: failed-login block duration
- `AUTH_FAILED_LOGIN_DELAY_MS`: invalid-login response delay
- `AUTH_FAILED_LOGIN_WINDOW_MS`: failed-login tracking window
- `AUTH_MAX_FAILED_LOGIN_ATTEMPTS`: failed-login threshold before blocking
- `FFMPEG_PATH`: override the FFmpeg binary path
- `FFPROBE_PATH`: override the ffprobe binary path
- `SHAKA_PACKAGER_PATH`: override the Shaka Packager binary path

Notes:

- Use `/login` for the site auth flow.
- Production Docker readiness requires the full vault configuration, writable storage,
  at least one auth account, and runnable FFmpeg, ffprobe, and Shaka Packager.
- Back up `VIDEO_MASTER_ENCRYPTION_SEED` with the storage volume and primary SQLite
  database. Existing encrypted media depends on preserving that value.
- `KEY_SALT_PREFIX` is optional. If you customize it, preserve it with the encryption seed
  and storage backup.
- Video segments use DASH/CENC/ClearKey with a per-video `key.bin`. Thumbnails use the
  same per-video key and are stored at `thumbnail.jpg` as a Mediavault AES-128-GCM
  envelope; authenticated HTTP responses expose only normal `image/jpeg` bytes.
- The default Compose port binding `3000:3000` is for simple reachability. For a hardened
  deployment, restrict direct HTTP access with firewall rules, bind the port to loopback,
  or place the app behind a private proxy network.
- The protected playback path issues `/videos/:videoId/token`, resolves `/videos/:videoId/manifest.mpd`, and serves `/videos/:videoId/clearkey` for the browser license flow.

## Architecture And Refactor Context

For the current architecture and repo state, start here:

- `docs/roadmap/current-refactor-status.md`
- `docs/roadmap/personal-video-vault-rearchitecture-phases.md`
- `docs/architecture/personal-video-vault-target-architecture.md`

## Technology Stack

- **Frontend**: React Router v7 with SSR
- **Runtime**: Bun (pure Bun, no Node.js)
- **Styling**: TailwindCSS v4
- **Persistence**: Primary SQLite database for auth sessions, canonical video metadata, playlists, and ingest state
- **Video**: FFmpeg for thumbnails and streaming
- **Streaming**: DASH with JWT token issuance, ClearKey license delivery, and encrypted media packaging
- **Thumbnail storage**: AES-128-GCM envelope at `thumbnail.jpg`, decrypted server-side after authentication

## Testing

The test suite is split by scope:

- `bun run test:modules`: colocated module and policy tests
- `bun run test:integration`: route and auth integration tests
- `bun run test:ui-dom`: jsdom + React Testing Library component tests
- `bun run vitest:ui`: interactive Vitest UI for local debugging only
- `bun run test:run`: all Vitest projects
- `bun run test:smoke:dev-auth`: dev-server auth smoke against `bun run dev`
- `bun run test:smoke:bun-auth`: Bun runtime smoke against the built server
- `bun run check`: hermetic lint + typecheck + Vitest + Bun smoke + calibrated coverage + build
- `bun run verify:docker-compose-smoke`: Docker Compose production readiness contract
- `bun run verify:e2e-smoke`: required browser smoke command

Why the smoke layers exist:

- Vitest runs in Node for this repo
- `bun run dev` and `bun run start` do not execute route code the same way
- runtime-only regressions, such as unsupported module schemes, must be caught separately

Smoke split:

- `test:smoke:dev-auth`: account login must work under the dev server
- `test:smoke:bun-auth`: built Bun server must still protect token and thumbnail routes correctly

Browser verification remains a separate step for UI and playback flows. See [docs/E2E_TESTING_GUIDE.md](docs/E2E_TESTING_GUIDE.md).

If Playwright playback fixtures need to be rebuilt for the browser-safe H.264 policy, refresh them with:

```bash
bun run backfill:browser-playback-fixtures
```

The script rebuilds only the known Playwright fixture video IDs and leaves already-compatible manifests untouched.

---

Built with ❤️ using React Router and Bun.
