# Version-bound dependency fixes

## React Router compile-only Vite servers

The version-bound React Router 8.5.1 patch marks its config loader and child compiler as middleware-only Vite servers and disables their WebSocket listeners. Neither internal server owns the application's HTTP endpoint.

Without these settings, Vite 8 installs process-wide SIGTERM exit handlers for those compile-only servers and can bind an unnecessary shared WebSocket port. An internal compiler can therefore exit the process before Mediavault's HTTP drain and ingest-worker shutdown complete. Disabling HMR alone does not disable Vite 8's separate WebSocket server.

The compile-only child compiler also disables its inherited browser dependency optimizer. Otherwise it scans raw server route modules without the application's initialized route-export transform, producing Node browser-external warnings and server-only resolver errors. The actual application's client and SSR dependency optimization remain enabled.

The application-owned Express/Vite server retains its own WebSocket connection and normal frontend HMR. Backend changes use the drained process restart configured in [nodemon.json](../nodemon.json).

[The pnpm configuration](../pnpm-workspace.yaml) applies this patch only to the affected package version. On a React Router upgrade, remove it once upstream gives both internal servers middleware-only, WebSocket-free ownership. Verify development and production SIGTERM shutdown, active media-child exit, persisted-job recovery, type generation, and production builds with `pnpm test:runtime:smoke` before retiring it.

## Encrypted SQLite declaration export

The stable `better-sqlite3-multiple-ciphers` 13.0.3 package ships declarations but its root export hides them from TypeScript's bundler resolution. Its metadata-only patch adds a `types` condition pointing to the shipped declaration file and keeps the existing JavaScript target as `default`. No declaration is copied, invented, or weakened. Remove this patch once a stable upstream release exports those declarations correctly.

## Development supervisor shutdown budget

Nodemon 3.1.14 waits only ten seconds when quitting, despite waiting for a child on ordinary reloads. Its single-constant patch allows the same 35-second supervisor budget as Compose: Mediavault owns the first 30 seconds to drain HTTP requests, workers, and actual media-child exits. Remove this patch if upstream exposes a supported configurable quit deadline or an equally safe supervisor replaces Nodemon. The isolated supervisor runtime test exercises reload and quit with a child whose shutdown exceeds ten seconds.
