# Security Audit Report - 2026-05-12

Status: Current defensive audit report
Auditor: Codex
Scope: Local development server, built production server, Docker Compose production readiness, and repository-wide defensive review.

## Summary

This audit used read-only subagent review to collect defensive risk signals, then validated candidates directly on localhost. Only findings with local evidence are listed as confirmed vulnerabilities. Items that were identified by review but not proven as exploitable in this audit are separated as hardening candidates.

Confirmed findings:

| Severity | Finding | Environment | Status |
| --- | --- | --- | --- |
| Critical | Development server exposes repository and storage files without app authentication | `bun run dev` | Confirmed |
| Medium | Failed-login rate limiting can be bypassed when proxy headers are trusted on a directly exposed app | `bun run dev` with `AUTH_TRUST_PROXY_HEADERS=true` | Confirmed under unsafe deployment configuration |
| Low | Authenticated upload errors expose internal parser messages | `bun run dev` | Confirmed |

The built server blocked the development-server static file exposure paths with `404`. `bun run verify:docker-compose-smoke` passed, covering the production container readiness scenarios in the current verification contract.

## Method

### Subagent Review

Four read-only subagents were requested:

- Auth/session/proxy-header route coverage review: completed.
- Ingest/filesystem/process/SQLite review: completed.
- Browser/API headers/CSRF/XSS review: completed.
- Storage/dev-server/Docker static serving review: timed out and was closed.

Subagents were instructed not to produce exploit steps or PoC commands. They reported defensive risk signals, file references, and verification questions. Final vulnerability decisions and localhost validation were performed in the parent audit.

### External Baseline

The audit used current public guidance from:

- Vite Server Options for development-server host, CORS, and filesystem serving controls: https://vite.dev/config/server-options.html
- OWASP Cross-Site Request Forgery Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP HTTP Security Response Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

### Local Verification Commands

The main verification surfaces were:

```bash
AUTH_SHARED_PASSWORD='audit-password' \
VIDEO_JWT_SECRET='audit-jwt-secret' \
VIDEO_MASTER_ENCRYPTION_SEED='audit-master-seed' \
AUTH_FAILED_LOGIN_DELAY_MS=1 \
bun run dev
```

```bash
PORT=5175 \
AUTH_SHARED_PASSWORD='audit-password' \
VIDEO_JWT_SECRET='audit-jwt-secret' \
VIDEO_MASTER_ENCRYPTION_SEED='audit-master-seed' \
bun run start
```

```bash
bun run verify:docker-compose-smoke
```

## Confirmed Finding 1: Development Server Exposes Repository And Storage Files

Severity: Critical when the development server is reachable by an untrusted client.

Environment: `bun run dev` at `http://localhost:5173`.

### Evidence

The protected application route denied anonymous media access:

```text
GET /videos/05a99383-fc89-4ec6-b588-2ff8c6acb719/manifest.mpd
HTTP/1.1 401 Unauthorized
{"success":false,"error":"Authentication required"}
```

However, Vite development file serving exposed the same storage tree outside the protected route layer:

```text
GET /storage/videos/05a99383-fc89-4ec6-b588-2ff8c6acb719/key.bin
HTTP/1.1 200 OK
Content-Length: 16
Content-Type: application/octet-stream
sha256=8b129302a56809b8322f28d73036e5015f6062ed6ea8ca6783143a513a650974
size=16
```

The primary SQLite database was also retrievable:

```text
GET /storage/db.sqlite
HTTP/1.1 200 OK
Content-Length: 4096
/tmp/audit-dev-db.sqlite: SQLite 3.x database
size=4096
```

Server source compiled by Vite was also served without app authentication:

```text
GET /app/shared/config/auth.server.ts
HTTP/1.1 200 OK
Content-Type: text/javascript
import { normalizeSharedPassword } from "/app/shared/lib/normalize-shared-password.ts";
const DEFAULT_FAILED_LOGIN_BLOCK_DURATION_MS = 5 * 60 * 1e3;
```

### Impact

This bypasses the app-level route guards for local storage files. In the current project layout, `storage/` is under the repository root, so dev-server file serving can expose:

- `storage/db.sqlite`
- `storage/videos/:videoId/key.bin`
- DASH manifests and media segments
- local test videos under `storage/test-videos`
- server source transformed by Vite

For this product, exposing `key.bin`, media artifacts, and SQLite data directly undermines the protected-vault model for any deployment or tunnel that exposes `bun run dev` beyond trusted localhost.

### Production Check

The built server did not expose these paths:

```text
GET /storage/videos/05a99383-fc89-4ec6-b588-2ff8c6acb719/key.bin
HTTP/1.1 404 Not Found

GET /app/shared/config/auth.server.ts
HTTP/1.1 404 Not Found

GET /package.json
HTTP/1.1 404 Not Found
```

### Recommended Patch

Primary fix:

- Move the default development `STORAGE_DIR` outside the repository root, or
- Configure Vite dev server to deny `storage`, `binaries`, `.env*`, and other sensitive repo-local paths.

Additional controls:

- Add a dev-server smoke test that asserts `/storage/db.sqlite`, `/storage/videos/.../key.bin`, and `/app/shared/config/auth.server.ts` are not served anonymously.
- Document that `bun run dev` must never be exposed to an untrusted network.
- Prefer tracked fixture directories outside runtime storage for browser smoke data.

### Remediation Status

Completed in the dev-server hardening pass tracked by
`docs/plans/2026-05-13-dev-server-sensitive-file-exposure-hardening-plan.md`.

Implemented controls:

- default development storage moves outside the repository root when `NODE_ENV=development` and `STORAGE_DIR` is unset
- the Vite dev server uses loopback host defaults, filesystem deny rules for repo-local storage/binaries/build/test output/env files, and direct-request middleware for server-only source paths
- `test:smoke:dev-auth` now verifies that repo-local storage, key, env, binary, composition server source, shared server config, and auth infrastructure canaries do not return `200` or `206` and do not leak canary body bytes

Verification evidence:

- `bun run test:smoke:dev-auth`
- `bun run test:integration -- tests/integration/shared/storage-paths.server.test.ts tests/integration/shared/playback-storage-paths.server.test.ts`
- `bun run verify:base`
- `bun run verify:ci-worktree:docker`

## Confirmed Finding 2: Proxy Header Trust Can Bypass Failed-Login Rate Limiting

Severity: Medium.

Environment: `AUTH_TRUST_PROXY_HEADERS=true` with the app directly reachable by the requester.

### Evidence

With a stable forwarded IP, the sixth invalid login was rate limited:

```text
401
401
401
401
401
429
last={"success":false,"error":"Too many login attempts. Try again later."}
```

With a different `X-Forwarded-For` value on each request, the same sequence avoided the rate limit:

```text
401
401
401
401
401
401
last={"success":false,"error":"Invalid password"}
```

The default configuration (`AUTH_TRUST_PROXY_HEADERS=false`) did not show this bypass in the previous verification pass; spoofed `X-Forwarded-For` still reached `429`.

### Code References

- `app/composition/server/auth-client-identity.ts` reads `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`, and `Forwarded`.
- `app/shared/config/auth.server.ts` defaults `AUTH_TRUST_PROXY_HEADERS` to false.
- `app/composition/server/auth.ts` uses `InMemoryLoginAttemptGuard`.

### Impact

If the app is directly exposed while trusting proxy headers, a requester can influence the client IP identity used for rate limiting. That makes password guessing materially easier.

This is deployment-sensitive: it is acceptable only when a trusted reverse proxy strips untrusted inbound forwarding headers and writes canonical values before forwarding to the app.

### Recommended Patch

- Keep `AUTH_TRUST_PROXY_HEADERS=false` unless the app is behind a trusted proxy that overwrites forwarding headers.
- Add documentation warning that direct exposure with this flag enabled weakens login throttling.
- Consider replacing the boolean with a trusted-proxy allowlist or requiring a deployment-specific secret/header from the proxy before forwarded IP headers are honored.
- Consider adding a proxy-layer rate limiter for production deployments.

## Confirmed Finding 3: Authenticated Upload Errors Expose Internal Parser Messages

Severity: Low.

Environment: Authenticated request to `bun run dev`.

### Evidence

After a valid login, a malformed upload request returned an internal parser message:

```text
POST /api/uploads
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain;charset=UTF-8

Missing multipart boundary
```

A malformed multipart stream with a very large header/preamble returned another implementation detail:

```text
POST /api/uploads
HTTP/1.1 500 Internal Server Error

Upload stream ended before the multipart boundary closed
```

### Code References

- `app/routes/api.uploads.ts` returns `error.message` from `defaultCreateErrorResponse`.
- `app/routes/api.uploads.$stagingId.commit.ts` has the same pattern.
- `app/modules/ingest/infrastructure/upload/bun-streaming-multipart-upload.adapter.ts` raises detailed parser messages.

### Impact

The issue requires authentication, so it is not a direct anonymous data leak. It does expose internal parser behavior and can reveal details about upload handling, storage state, or media tooling errors to any authenticated user.

### Recommended Patch

- Return stable public errors such as `Invalid upload request` or `Upload failed`.
- Log detailed exception messages server-side only.
- Map expected upload validation failures to `400` instead of `500`.

## PoC-Attempted Or Directly Reviewed Hardening Candidates

These were identified during review but are not reported above as fully confirmed vulnerabilities unless the stated condition applies.

### Multipart Header Buffer Growth

Subagent finding: `bun-streaming-multipart-upload.adapter.ts` appends to `headerBuffer` until `\r\n\r\n` appears, and the large body size limit applies after multipart body parsing starts.

Audit result: A 1 MiB malformed header was accepted into parser flow and returned a 500 parser error. This confirms the parser lacks an early small header cap, but this audit did not perform memory pressure testing.

Recommendation:

- Enforce a bounded multipart header/preamble size.
- Enforce a reasonable boundary length.
- Return `400` for malformed multipart input before large allocation.

### Long-Lived Public Cache Headers On Protected Segments

Subagent finding: media segments return `Cache-Control: public, max-age=31536000`.

Audit result: Reviewed as a credible hardening issue. The route requires both session and playback token before serving segments, but `public` cache semantics are a poor fit for protected personal media if any shared cache is introduced.

Recommendation:

- Prefer `Cache-Control: private, max-age=...` or `no-store` depending on playback performance needs.
- Keep ClearKey license responses `no-store`.

### Query-String Playback Tokens

Subagent finding: playback token extraction checks the `token` query parameter, and the client appends the token to DASH request URLs.

Audit result: Not sufficient by itself for access because media routes also require a site session. Still a real exposure channel for logs, browser history, referrers, and cache keys.

Recommendation:

- Prefer Authorization headers where browser/player support allows.
- If query tokens remain, keep TTL short, use strict referrer policy, and avoid public caching.

### GET Logout Changes Session State

Subagent finding: `/api/auth/logout` supports a loader that destroys the session.

Audit result: Not treated as a confirmed high-impact vulnerability because cookies are `SameSite=Strict`, but state-changing GET endpoints are brittle.

Recommendation:

- Prefer POST-only logout.
- Keep a user-initiated form/button for logout rather than a plain link.

### Missing Global Security Headers

Subagent finding: app-level global headers such as CSP, HSTS, frame policy, permissions policy, and global referrer policy are not evident in the SSR entry.

Audit result: No direct exploit was proven. This is a defense-in-depth gap.

Recommendation:

- Add app or reverse-proxy owned headers:
  - `Content-Security-Policy`
  - `Strict-Transport-Security` in HTTPS production
  - `X-Frame-Options` or `frame-ancestors`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - `Permissions-Policy`

### Process-Local Login Rate Limiter

Subagent finding: failed-login state is in memory.

Audit result: Acceptable for a single-process local vault, weaker for multi-instance or frequently restarted production.

Recommendation:

- Document the single-process assumption.
- Use proxy-level or persistent rate limiting if the app is scaled horizontally.

### Runtime Trust In Persisted Storage Paths

Subagent finding: staged upload storage paths are constrained by schema when written, but later deletion trusts persisted paths when mapping rows back to the filesystem.

Audit result: No local request PoC was proven without direct DB tampering. Still worth hardening because recursive deletion should defend against corrupt/imported DB state.

Recommendation:

- Re-assert containment before every recursive filesystem deletion.
- Add tests with malicious/corrupt persisted paths.

### Reserved Video ID Constraint Gap

Subagent finding: `reserved_video_id` lacks the same CHECK constraint shape as `videos.id`.

Audit result: No request-level PoC was proven. Runtime normally reserves UUIDs, but schema hardening would reduce damage from corrupt/imported DB rows.

Recommendation:

- Add schema/runtime validation for `reserved_video_id`.

## Positive Findings

- Anonymous requests to normal protected app/media/API routes returned `302` or `401`.
- Built production server blocked dev static file paths with `404`.
- `bun run verify:docker-compose-smoke` passed:

```text
✓ checked-in docker-compose.yaml config
✓ configured: healthy
✓ missing-secret: exited
✓ blocked-storage: exited
✓ missing-media-tool: unhealthy
```

- Direct XSS sinks such as `dangerouslySetInnerHTML`, `innerHTML`, `eval`, and `new Function` were not found in `app/`.
- SQLite access is mostly parameterized; no request-level SQL injection candidate was confirmed.
- Playback segment filenames are restricted to `init.mp4` or `segment-\d{4}.m4s`.
- Redirect targets reject external URLs and protocol-relative `//` targets.
- Session cookies are configured as `HttpOnly` and `SameSite=Strict`; `Secure` is enabled when `NODE_ENV=production`.

## Recommended Patch Order

1. Block dev-server exposure of `storage/` and source files, or move `STORAGE_DIR` outside the repo root.
2. Add regression tests for anonymous access to sensitive dev paths.
3. Harden `AUTH_TRUST_PROXY_HEADERS` documentation and behavior.
4. Normalize upload/API error responses and status codes.
5. Add multipart header and boundary size limits.
6. Review protected media cache headers and query-string token transport.
7. Add app or proxy security headers.
8. Add runtime containment checks before recursive filesystem deletion.

## Verification Record

Commands run during the audit:

```text
bun run dev
bun run dev -- --port 5174
bun run start
bun run verify:docker-compose-smoke
curl checks against protected routes, dev static paths, built server paths, login rate limiting, and upload error handling
```

No source files were changed except this report.
