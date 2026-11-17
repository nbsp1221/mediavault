# Mediavault

A self-hosted encrypted video library built with React Router Framework, React, and Node.js LTS. One application serves the web UI, same-origin API and protected media routes, and the media-processing runner.

## Product boundaries

- Anonymous visitors can browse and play public videos and public playlists.
- Account holders can upload videos, manage their own metadata and visibility, and organize playlists.
- Private videos and playlists remain owner-only. A public playlist never grants access to a private video.
- Accounts are provisioned through an operator-only bearer-authenticated API; there is no public signup or site-admin bypass for another account's private videos.
- Media uses encrypted DASH/CENC packaging and ClearKey delivery. Thumbnails and the primary SQLite database are encrypted at rest.
- This is not commercial DRM: an authorized client or a compromised running host can extract content. HTTPS, host security, and preservation of encryption secrets remain operator responsibilities.

## Requirements

Use the Node.js and pnpm versions declared in [package.json](package.json) and [.node-version](.node-version). Do not install with another package manager or create another lockfile.

FFmpeg, ffprobe, and Shaka Packager are needed for upload processing and playback fixtures. The production image includes them; local development can provision them with:

```bash
pnpm install --frozen-lockfile
pnpm download:ffmpeg
pnpm download:shaka
```

## Local development

```bash
cp .env.example .env
# Supply unique local secret values and bootstrap settings before starting.
pnpm dev
```

The development command explicitly loads the optional local environment file. Verification commands do not use it. See [.env.example](.env.example) for supported settings.

Set these secrets:

- `MEDIAVAULT_DATABASE_ENCRYPTION_KEY`
- `MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET`
- `MEDIAVAULT_PLAYBACK_JWT_SECRET`
- `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET`

For first-account provisioning, also configure `MEDIAVAULT_ADMIN_API_MODE=bootstrap` and a unique `MEDIAVAULT_ADMIN_API_TOKEN`. After the server starts, create an account through the operator API:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer ${MEDIAVAULT_ADMIN_API_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"replace-with-a-unique-long-passphrase"}' \
  http://127.0.0.1:5173/api/admin/users
```

The example assumes the token is also available to the shell running curl; loading the server's environment file does not export it into another shell. Do not publish example credentials or reuse them in production. Passwords allow 15–128 Unicode characters, including spaces.

Bootstrap provisioning closes once the first account exists. Use `always` only for intentionally enabled ongoing operator automation, and protect/rotate the bearer credential independently of site sessions.

The development server is for trusted local use only. Do not expose it through a public tunnel or reverse proxy. Development storage defaults outside the checkout; never put media, keys, or databases in the static asset directory.

## Production

Inject the configured environment, then build and start:

```bash
pnpm build
pnpm start
```

Production start does not implicitly load a local environment file. Startup checks require usable encrypted storage, required secrets, and an existing account or explicitly enabled bootstrap path. The readiness endpoint additionally checks media tooling:

- `GET /health/ready`: empty `204` when ready, otherwise empty `503`.
- Detailed failures belong in sanitized server logs, not public health responses.

Use HTTPS for remote access. Production session cookies are secure cookies. Behind an operator-managed Caddy proxy, set `MEDIAVAULT_PUBLIC_ORIGIN` to the browser-facing origin and keep the app port private. The runtime derives React Router's exact allowed action host from that same origin; application CSRF checks still match the full scheme, host, and port. Only enable forwarded client-IP trust at that explicit boundary. See the [reverse-proxy contract](docs/reverse-proxy.md); the app does not manage Caddy, public ingress, WAF rules, or network quota policies.

### Docker

```bash
cp .env.example .env
# Configure deployment-specific secrets and bootstrap credentials.
docker compose up --build -d
```

The checked-in [Compose configuration](docker-compose.yaml) builds the local source and persists the storage volume. It is not a published-image pull/update workflow. [CI](.github/workflows/ci.yml) can publish the GHCR image after verified main-branch changes; deploying or restarting that image is an operator action.

### Storage and backups

The production default is:

```text
storage/
├── db.sqlite
├── videos/
└── staging/
```

`MEDIAVAULT_STORAGE_DIR` overrides the root. Back up the database and media consistently with their encryption secrets and any customized derivation salt. Losing the database key prevents reopening the database; changing the media derivation configuration can make existing encrypted assets unusable. The entire volume is sensitive: usable media-key files, retained uploads, and processing intermediates are not all encrypted. Restrict host/backup access and follow the [storage](docs/storage-encryption.md), [playback](docs/playback.md), and [ingest](docs/ingest-jobs.md) contracts.

This application targets its current fresh-install schema. Retired storage layouts, synthetic owner identities, and historical compatibility migrations are not supported. Do not point an old vault at a new schema without an explicitly designed import/export procedure.

## Source navigation

```text
app/
├── routes/                 # URL and HTTP adapters
├── pages/                  # Page-owned UI and state
├── features/               # Focused shared user workflows
├── entities/               # Shared presentation models
├── widgets/                # Genuinely shared compositions
├── modules/                # Domain/application/infrastructure where useful
├── composition/server/     # Dependency assembly and cross-module wiring
└── shared/                 # Generated UI primitives, configuration, helpers
```

This is one private package, not a synthetic apps/packages monorepo. Framework boundaries and business ownership matter more than uniform folder depth. See [repository guidance](AGENTS.md) and [architecture](docs/architecture.md).

## Development gates

The maintainer's shared configuration powers **Oxlint + ESLint + Oxfmt**. Generated shadcn primitive internals are not manually patched or reformatted for page-level fixes.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check
pnpm check:runtime
```

- `check:fast` is an iteration shortcut, not a completion gate.
- `check` includes fixture isolation, design/format/lint/type checks, coverage/regression/changed-file coverage, and development/production runtime smoke.
- `check:runtime` adds required browser smoke and Docker readiness scenarios.
- Storage changes additionally require `check:data-integrity` with explicit isolated storage and keys.
- All Playwright runs use isolated fixtures. Fixture backfill is an explicit maintenance action, not permission for a test to modify local user storage.
- Real browser QA is required for browser-visible runtime changes; mounting a player or receiving HTTP 200 is not proof of decoded playback.

## Current documentation

- [Product scope](PRD.md), [architecture](docs/architecture.md), and [design system](DESIGN.md)
- [Playback](docs/playback.md), [ingest jobs](docs/ingest-jobs.md), and [encrypted database storage](docs/storage-encryption.md)
- [Reverse-proxy deployment](docs/reverse-proxy.md)
- [Verification contract](docs/verification-contract.md), [browser QA contract](docs/browser-qa-contract.md), [E2E guide](docs/E2E_TESTING_GUIDE.md), and [local CI reproduction](docs/LOCAL_GITHUB_ACTIONS_CI_REPRODUCTION.md)

Work on a task branch. Commits require explicit authorization and the commit skill; pushes and pull requests require separate permission. Research reports, progress logs, scratch code, and QA screenshots stay outside the repository.
