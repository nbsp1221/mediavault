# Production Startup Preflight Product Specification

Status: Product policy decisions incorporated
Date: 2026-05-02
Owner: Codex product specification pass
Scope: Define the product contract for production startup and readiness preflight checks for Docker Compose deployment.

## 1. Background And Problem Definition

Local Streamer is now close enough to its personal video vault target that real self-hosted use is a reasonable next step. The intended deployment model is a Docker Compose service running on the owner's server, normally reached through an HTTPS reverse proxy such as Caddy.

Recent Docker verification showed that the production image can build, the Compose service can start, browser login can work, upload can commit, and protected playback can complete when the deployment is configured correctly. The same verification also exposed the specific problem this specification addresses:

- a production container can start and report healthy even when configuration required for the full vault path is missing
- missing `VIDEO_JWT_SECRET` or `VIDEO_MASTER_ENCRYPTION_SEED` may only surface later in playback or encryption paths
- missing app-owned production prerequisites make Docker Compose health misleading
- the owner may believe the deployment is ready, then discover misconfiguration only after trying to upload or play media

This specification is not about adding future product features. It exists to close the current production-readiness gap found during Docker Compose deployment review.

The product need is a clear production readiness contract: when Local Streamer says it is healthy or ready in production, the owner should be able to trust that the core full-vault prerequisites are present.

## 2. Goals

- Make production startup fail early when required full-vault secrets are missing.
- Make production startup fail early when the configured storage root cannot support durable app writes.
- Make production readiness fail when required media tools are unavailable.
- Ensure a healthy production container means the core auth, storage, protected playback, encryption, and media packaging prerequisites are configured.
- Give the owner clear, actionable error messages that name missing configuration keys or failing readiness categories without printing secret values.
- Preserve lightweight development and hermetic test workflows unless they intentionally run a production-readiness path.
- Keep infrastructure responsibilities separate from application responsibilities.
- Establish a product policy for critical errors, readiness diagnostics, and deployment guidance so later test and implementation plans have a stable source of truth.

## 3. Non-Goals

- Do not ship Caddy, Nginx, Traefik, ACME certificate automation, or a complete production reverse-proxy stack as part of the default app runtime.
- Do not make HTTP-only private deployments a first-class production mode.
- Do not introduce multi-user auth, OAuth, account management, secret-manager integrations, Docker secrets integration, Vault, SOPS, or similar external secret-management features.
- Do not implement secret rotation, key migration, backup/restore, or recovery tooling in this feature.
- Do not perform runtime secret entropy, length, format, or placeholder blocklist enforcement beyond non-blank presence checks.
- Do not make `KEY_SALT_PREFIX` a required production secret.
- Do not redefine the ingest, playback, storage, or playlist product model.
- Do not solve Docker image reproducibility or media binary pinning in this feature.
- Do not solve playback-token URL log redaction or the observed production hydration warning in this feature.
- Do not decide exact code structure, process hooks, or internal helper names.

## 4. User Intent

The owner wants to self-host Local Streamer for real personal use. They want to know before using the server whether the deployment is actually capable of supporting the vault's core flows:

- logging in through the shared password gate
- uploading videos through the browser-first upload flow
- storing the resulting database rows and media artifacts durably
- packaging media with the required local tools
- playing protected DASH/ClearKey media through the browser

The owner also wants responsibility boundaries to stay explicit. The application should own application readiness. The deployment environment should own HTTPS, reverse proxy routing, domain, firewall, storage backup, and secret backup.

## 5. Core Requirements

### 5.1 Production Mode Trigger

`NODE_ENV=production` is the production preflight trigger. There should not be a second product-level feature flag required to make production startup strict.

This keeps the deployment model simple: if the app is running as production, it must satisfy the production full-vault contract.

### 5.2 Critical Production Configuration

In production, the app must treat these as critical full-vault requirements:

- `AUTH_SHARED_PASSWORD`
- `VIDEO_JWT_SECRET`
- `VIDEO_MASTER_ENCRYPTION_SEED`

If any of these values are absent or blank, production startup must fail. An auth-only production mode is not a supported product contract.

### 5.3 Secret Validation Policy

Production preflight must require critical secrets to be present and non-blank. It must not reject values because they are short, weak-looking, non-hex, or equal to a known example string.

Secret strength remains a documentation and operator responsibility. The docs and `.env.example` should guide the owner to generate unique, cryptographically strong deployment secrets, but runtime startup should not attempt heuristic strength scoring.

### 5.4 Storage Readiness Policy

In production, an unavailable or unwritable `STORAGE_DIR` is a startup-blocking failure.

The vault cannot safely operate without durable writable storage for SQLite state, staged uploads, committed media artifacts, thumbnails, manifests, keys, and segments. Starting as production without writable storage would create a misleading deployment signal.

### 5.5 Media Tool Readiness Policy

The full vault upload and playback preparation path depends on FFmpeg, ffprobe, and Shaka Packager.

Missing or non-executable media tools must make full-vault readiness fail. They do not need to be treated as a product-level startup hard fail, because the primary P2 problem is the false healthy signal. The production service may remain alive for diagnostics, but it must not report ready/healthy for full vault use while required media tools are unavailable.

In production, explicit media tool path environment variables are authoritative. If `FFMPEG_PATH`, `FFPROBE_PATH`, or `SHAKA_PACKAGER_PATH` is set, readiness must validate that explicit path instead of silently falling back to bundled or system tools. If an explicit path is absent, the existing bundled/system resolution may be used.

Media tool readiness should perform a bounded no-op or version invocation for each required tool. Path existence alone is not enough for production readiness because broken binaries, incompatible architecture, missing dynamic linkers, or noexec mounts can otherwise pass preflight and fail on first upload. Version pinning remains out of scope.

### 5.6 Readiness Signal Policy

The app should expose `GET /health/ready` as the canonical public-safe readiness endpoint for Docker healthchecks or equivalent automation.

The public-safe signal should reveal only readiness status, not sensitive deployment detail or coarse diagnostic categories. A ready response should use `204 No Content`. A not-ready response should use `503 Service Unavailable` without diagnostic detail in the response body. Detailed failure causes should be available through normal container logs. A separate operator-only diagnostic command is not required for the first implementation.

Dockerfile and Compose healthchecks must consume `GET /health/ready`. A generic liveness route, auth route, home page, or root page must not remain the production health contract after this feature, because that would preserve the original false-healthy failure mode.

### 5.7 Compose Port Policy

The default Docker Compose port binding should remain `3000:3000` for simple first-run usability and common self-hosted conventions.

Production hardening should be documented separately: operators can restrict direct HTTP access with firewall rules, bind to loopback such as `127.0.0.1:3000:3000`, or place the app only on a private proxy network. The app should not silently assume or enforce one reverse-proxy topology.

### 5.8 Responsibility Boundary

The app should not fail startup only because it cannot prove external HTTPS termination.

HTTPS, reverse proxy trust, public port exposure, domain routing, and certificate automation are external deployment contracts. The app should document them clearly and remain compatible with them, but it should not bundle or mandate a specific reverse proxy.

## 6. Functional Requirements

### 6.1 Production Secret Preflight

The product must provide production preflight behavior that verifies all critical production secrets before the app is considered started for normal production use.

Expected behavior:

- all critical secrets present and non-blank: production startup may proceed
- one or more critical secrets missing: production startup fails
- critical secret set to whitespace only: treat as missing
- multiple missing values: report all known missing key names together when practical
- secret values are never printed

### 6.2 Storage Preflight

Production startup must verify that the configured storage location and configured primary SQLite database location are usable for durable app writes.

Expected behavior:

- storage can be created and written as required by the app: production startup may proceed
- storage cannot be created, opened, or written: production startup fails
- failure messages distinguish storage readiness problems from missing secret problems

The minimum storage preflight must cover the configured storage root and the configured primary SQLite database parent/path, including `DATABASE_SQLITE_PATH` when it is overridden. The write probe should use an app-owned sentinel inside the configured storage root or configured primary SQLite database parent. It must not use arbitrary OS temporary storage and must avoid mutating user media.

Production readiness must re-check a lightweight storage write/delete probe and primary SQLite path availability on each readiness evaluation. Startup preflight remains the hard-fail gate, while readiness protects against post-startup volume, permission, or disk-state drift.

### 6.3 Media Tool Readiness

Production readiness must account for FFmpeg, ffprobe, and Shaka Packager availability.

Expected behavior:

- required tools are present and executable: full-vault readiness may pass
- one or more required tools are missing or non-executable: full-vault readiness fails
- one or more required tools cannot complete a bounded no-op/version invocation: full-vault readiness fails
- failure details identify the missing tool names in container logs
- public health/readiness responses do not expose detailed filesystem paths

If startup-blocking failures and readiness-only failures coexist, startup-blocking failures take precedence. Readiness-only checks may be skipped when startup cannot proceed; diagnostics should make that ordering clear instead of implying skipped checks passed.

### 6.4 Readiness Endpoint Or Diagnostic Surface

The product should provide an automation-friendly readiness surface.

Expected behavior:

- `GET /health/ready` returns `204 No Content` when ready and `503 Service Unavailable` when not ready
- unauthenticated public responses avoid secret names, secret values, local paths, and detailed binary locations
- unauthenticated public responses avoid diagnostic categories beyond the minimal ready/not-ready status implied by the HTTP status code
- operator-facing logs provide actionable details
- Dockerfile and Compose healthchecks use `GET /health/ready`

### 6.5 Deployment Guidance

Deployment documentation must distinguish:

- app-owned required configuration
- Docker/runtime readiness conditions
- operator-owned infrastructure contracts
- hardening options that are recommended but not enforced by the default Compose file

The docs must not imply that Compose's default HTTP port is enough for remote production browser use when production cookies require HTTPS in normal browser use.

### 6.6 Secret Preservation Guidance

The product must make it clear that `VIDEO_MASTER_ENCRYPTION_SEED` is not disposable runtime noise. It is part of the durable vault identity and must be backed up alongside the storage volume and primary SQLite database.

`KEY_SALT_PREFIX` should remain optional with its existing default. If an operator customizes it, docs should treat it as durable vault configuration that must be preserved with `VIDEO_MASTER_ENCRYPTION_SEED` and storage. It should not become a required production secret.

## 7. Non-Functional Requirements

- Security: secret values must never be printed in preflight errors, health responses, or ordinary logs.
- Reliability: missing critical production configuration should be detected before the owner starts relying on upload or playback workflows.
- Operator experience: error output should be short, specific, and actionable.
- Simplicity: production strictness should follow `NODE_ENV=production` without adding a separate required mode switch.
- Portability: the readiness contract should work for Docker Compose and should not depend on a Compose-only mechanism.
- Testability: the policy must be verifiable from hermetic tests without relying on the developer's local `.env`.
- Backward compatibility: development and test paths should not become more fragile because production readiness is stricter.
- Documentation consistency: `.env.example`, README deployment notes, and runtime docs should describe the same required production configuration.

## 8. Key Scenarios

### 8.1 Correct Docker Production Deployment

The owner creates deployment-specific values for `AUTH_SHARED_PASSWORD`, `VIDEO_JWT_SECRET`, and `VIDEO_MASTER_ENCRYPTION_SEED`, provides writable storage, runs the Compose service, and places it behind HTTPS through Caddy.

Expected outcome:

- the service starts
- full-vault readiness passes
- browser login works through the HTTPS origin
- upload and playback can rely on the required secrets and media tools being present

### 8.2 Missing Playback JWT Secret

The owner sets `AUTH_SHARED_PASSWORD` and `VIDEO_MASTER_ENCRYPTION_SEED` but forgets `VIDEO_JWT_SECRET`.

Expected outcome:

- production startup fails
- logs name `VIDEO_JWT_SECRET` as missing
- no secret values are printed
- Docker Compose does not report the app as a healthy production service

### 8.3 Missing Encryption Seed

The owner sets auth and playback token configuration but forgets `VIDEO_MASTER_ENCRYPTION_SEED`.

Expected outcome:

- production startup fails before upload or playback work depends on encryption key derivation
- logs name `VIDEO_MASTER_ENCRYPTION_SEED` as missing
- no secret values are printed
- the owner is directed to generate and preserve a deployment-specific secret

### 8.4 Whitespace Secret

The owner defines a critical secret variable but the value is empty or whitespace only.

Expected outcome:

- production startup treats the value as missing
- logs name the affected key
- no secret values are printed

### 8.5 Unwritable Storage Volume

The Docker service has the required secrets but `/app/storage` is missing, read-only, full, or owned in a way that prevents app writes.

Expected outcome:

- production startup fails
- the failure identifies storage writeability rather than misreporting a generic server crash
- Docker Compose does not report the app as a healthy production service

### 8.6 Missing Media Tool In Docker Image

The service has secrets and storage, but FFmpeg, ffprobe, or Shaka Packager is not executable.

Expected outcome:

- the service may remain alive for diagnostics
- full-vault readiness fails
- Docker healthcheck should reflect the readiness failure
- container logs identify the missing tool

### 8.7 Auth-Only Local Investigation

A developer or owner runs the app locally with only `AUTH_SHARED_PASSWORD` while investigating auth or home-library behavior.

Expected outcome:

- non-production local investigation can remain possible
- production readiness claims are not made for this mode
- tests that intentionally exercise playback or ingest still provide scoped fixture secrets

### 8.8 HTTPS Reverse Proxy Not Configured

The service starts with all app-owned requirements but is accessed remotely over plain HTTP.

Expected outcome:

- the app remains compatible with reverse-proxy deployment
- deployment docs explain that production browser use requires HTTPS because production cookies are secure
- this is treated as an external deployment contract, not as a default app startup failure

## 9. Edge Cases And Failure Scenarios

- Required secret variables exist but contain only whitespace.
- `.env.example` blank placeholders are copied without replacement; blank values fail, while non-blank example-looking values remain runtime-accepted but documentation-warned.
- A weak-looking but non-blank secret is supplied; runtime accepts it, while docs remain responsible for strong-generation guidance.
- `VIDEO_MASTER_ENCRYPTION_SEED` is changed after media has already been stored.
- A deployment restores `storage/` from backup but loses the matching production secrets.
- A deployment restores `storage/` with a wrong-but-present `VIDEO_MASTER_ENCRYPTION_SEED`; preflight can verify only presence, not whether the seed matches existing encrypted assets.
- A production build runs outside Docker and relies on system `ffmpeg`, `ffprobe`, or `packager` binaries.
- `FFMPEG_PATH`, `FFPROBE_PATH`, or `SHAKA_PACKAGER_PATH` points to a non-existent or non-executable file.
- Storage is writable during startup but later becomes full or read-only.
- Caddy is configured correctly, but the app port is also exposed publicly over HTTP.
- `AUTH_TRUST_PROXY_HEADERS` is enabled while direct public access to the app container is still possible.
- CI or E2E smoke tests accidentally depend on the developer's local `.env`.
- Multiple configuration problems happen at once and the owner needs a concise grouped report.

## 10. Externally Guaranteed Contracts

The deployment operator must guarantee:

- unique deployment-specific values for `AUTH_SHARED_PASSWORD`, `VIDEO_JWT_SECRET`, and `VIDEO_MASTER_ENCRYPTION_SEED`
- durable backup of `VIDEO_MASTER_ENCRYPTION_SEED` together with `storage/` and the primary SQLite database
- preservation of `KEY_SALT_PREFIX` if it has been customized
- writable persistent storage mounted at the configured storage location
- HTTPS termination for remote browser production use
- no direct public exposure of the app's plain HTTP port when a reverse proxy is intended to be the public entry point
- correct reverse proxy header trust boundaries before enabling proxy-header-based client IP handling
- deployment-specific firewall, domain, TLS certificate, and backup operations

The application must guarantee:

- it fails production startup when critical full-vault secrets are absent or blank
- it fails production startup when configured storage cannot support durable app writes
- it does not report full-vault readiness when required media tools are unavailable
- it does not print secret values while reporting configuration problems
- it keeps development/test configuration independent from ambient local `.env` state
- it documents the difference between required full-vault config, optional deployment knobs, and operator-owned infrastructure

The Docker production image should guarantee:

- media tools required by the upload/playback packaging path are present or clearly diagnosed as missing
- storage paths are aligned with the documented `/app/storage` runtime model

## 11. Deferred Future Work And Separate Findings

These items are related to deployment quality, but they are outside the current P2 startup/readiness preflight scope:

- Add optional Caddy, Nginx, or Traefik example files.
- Add HTTPS certificate automation.
- Add Docker secrets, external secret-manager integration, or encrypted config workflows.
- Add secret rotation, vault key migration, or recovery tooling.
- Add runtime entropy scoring, placeholder blocklists, or secret policy enforcement beyond presence checks.
- Change the default Compose port binding away from `3000:3000`.
- Pin FFmpeg and Shaka Packager downloads or add checksum verification for reproducible Docker builds.
- Reduce Docker image size.
- Redact playback JWT query strings from request logs.
- Investigate the observed production React hydration warning.
- Build an in-app admin diagnostics dashboard.

## 12. Success Conditions

- A production deployment with missing critical secrets fails deterministically before being treated as started or ready.
- A production deployment with unwritable storage fails deterministically before being treated as started or ready.
- A production deployment with missing media tools is marked not ready for full-vault use.
- The owner can identify exactly which required key names or readiness categories failed from container logs.
- A correctly configured app runtime remains compatible with HTTPS reverse-proxy operation, and app-owned login, upload, and protected playback smoke paths still pass under configured production prerequisites.
- Local development and hermetic test workflows continue to support narrowly scoped configuration.
- README, `.env.example`, and current runtime docs agree on which variables are required for the full vault.
- The product boundary is clear: app-owned readiness is enforced by the app; HTTPS and reverse proxy setup remain external deployment responsibilities.
- Later test specifications can derive concrete positive and negative cases from this document without re-deciding the product policy.

## 13. Open Questions

No product-policy questions remain open for this P2 scope.

Implementation planning still needs to decide exact code placement, helper names, timeout values, and test harness wiring.
