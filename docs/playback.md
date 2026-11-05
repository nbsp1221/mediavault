# Playback contract

## Player ownership

The player page uses Video.js 10 React controls and media lists with an application-owned adapter to Shaka Player. Shaka owns encrypted DASH loading, networking, EME, and track selection. Video.js owns the control UI and media-state integration; the application seam translates the actual Shaka tracks rather than implementing a second player framework.

[SecureVideo](../app/pages/player/ui/SecureVideo.tsx) renders a server-safe shell and creates the engine only in a browser effect. [The playback lifecycle](../app/pages/player/lib/shaka-playback.ts) lazy-loads Shaka, validates its manifest/license entrypoints, and owns attach/load/destroy for one source. Cleanup unregisters filters and listeners and prevents an asynchronous import or load from reviving a disposed source. Token refresh updates a ref read by the existing request filter; it does not recreate the engine or reset playback position. A different source gets its own lifecycle.

[The media adapter](../app/pages/player/lib/shaka-media.ts) delegates native video behavior and translates available quality/audio choices. Controls may expose tracks actually present in an asset; this is not a promise that ingest generates a multi-quality ladder or that every source contains subtitles.

## Resource authorization

1. The token endpoint evaluates current video visibility and, for an authenticated viewer, the active account session.
2. Anonymous grants read public videos only. Authenticated grants read public or owned videos and identify the issuing session.
3. Manifest, audio/video initialization and segment, and ClearKey requests carry `Authorization: Bearer …`. Tokens are not placed in query strings, media URLs, local storage, or logs.
4. The Shaka filter accepts only the same origin and the selected video's known resource paths. It rejects credentials in URLs, query/fragment additions, and unexpected or cross-origin destinations before attaching a credential.
5. Each protected resource request rechecks the grant, video scope, current read access, and the active session when the grant is session-bound. Logout, session revocation, account changes, or a public-to-private change therefore affect subsequent resource requests; already buffered or extracted content cannot be recalled.

A public playlist does not make a private video public. Thumbnail reads follow the same public/owner access model through their own route; a page being visible is not authorization to bypass media checks. Playback grants are not bound to client IP addresses. Deployment origin and cookie-command CSRF rules are documented in [reverse-proxy deployment](reverse-proxy.md).

## Encryption and browser limits

Media is packaged as DASH with AES-128 CENC and delivered through ClearKey (`org.w3.clearkey`). ClearKey is not Widevine, PlayReady, FairPlay, or a commercial DRM license service. Do not relabel one key system's identifiers as another's or infer that encryption prevents extraction by an authorized browser.

Successful playback requires a secure browser context, working Media Source Extensions and EME/ClearKey, and decoders for the actual audio/video codecs. The current preparation path targets browser-compatible H.264/AAC where required, but an existing asset's codec still determines whether a given device can decode it. HEVC-only assets are not universally playable. Container metadata or a successful license request is not proof of decoded frames.

The application registers no HLS playback provider. Installing a general-purpose media library does not establish HLS support, Safari/FairPlay compatibility, or support on every browser/device. Chromium fixture verification is evidence for that tested path, not a browser support matrix. Autoplay and fullscreen remain subject to browser/user-gesture policy. Unsupported encryption/codec contexts must produce a useful error rather than an invented successful state.

## Storage is a security boundary

Encrypted segments, encrypted thumbnails, and the encrypted database do **not** mean every file in the storage volume is encrypted. Per-video `key.bin` files contain usable media keys; uploaded sources and processing intermediates can contain plaintext media. Failed/cancelled sources can be retained for explicit retry/removal. The entire storage root, working directories, encryption settings, and backups are sensitive.

Keep them out of static `public/`, browser build output, the Docker build context, logs, screenshots, and Git. Restrict host/volume permissions and backup access; use appropriate host/disk and backup encryption as an operator responsibility. Back up database and media consistently, preserve required secrets and any customized derivation salt, and do not delete WAL/journal files to manufacture a clean backup. See [database encryption](storage-encryption.md) and [ingest retention/publication](ingest-jobs.md).

## Verification

Unit tests cover lifecycle disposal, token-refresh stability, scoped request filtering, and media-list translation. Runtime tests cover protected resources and revocation. Browser QA must additionally demonstrate real decoded playback on a supported fixture: advancing time plus decoded/rendered video evidence, not just HTTP 200, a mounted player, `canplay`, or a disappearing loading label.

Use the [browser QA contract](browser-qa-contract.md) and [E2E guide](E2E_TESTING_GUIDE.md). Authenticated media traces can contain cookies, bearer credentials, licenses, and keys; keep tracing off and report only sanitized outcomes.
