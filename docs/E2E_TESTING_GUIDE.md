# End-to-end testing guide

The [verification contract](verification-contract.md) owns required gates. The [browser QA contract](browser-qa-contract.md) owns personal browser evidence and secret-safe recording. Use the Node.js/pnpm versions from [package.json](../package.json), not a second runtime or lockfile.

## Test layers

| Layer                        | Command                   | Purpose                                                                                                                          |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Module                       | `pnpm test:modules`       | Policies, use cases, and focused infrastructure behavior                                                                         |
| Integration                  | `pnpm test:integration`   | HTTP adapters, session/access policy, persistence, processing, and tooling contracts                                             |
| UI DOM                       | `pnpm test:ui-dom`        | React Testing Library/jest-dom/user-event behavior; not real media decoding                                                      |
| All ordinary tests           | `pnpm test`               | Non-watch Vitest projects                                                                                                        |
| Node runtime                 | `pnpm test:runtime:smoke` | Actual development and built server startup, HTTP security, persistent worker recovery, child exit, and graceful backend restart |
| Required browser smoke       | `pnpm test:e2e:smoke`     | Public/owner browsing, upload/jobs, playlists, product shell, player layout, and decoded playback                                |
| Browser developer entrypoint | `pnpm test:e2e`           | The same isolated Playwright configuration, with optional focused spec arguments                                                 |

Start with deterministic module/integration/HTTP assertions. Use browser locators and web-first waits when the success condition involves cookies, navigation, UI, or decoding. Do not replace required runtime/browser coverage with a DOM render or a mocked engine.

## Supported browser setup

```bash
pnpm install --frozen-lockfile
pnpm test:e2e:smoke
```

The smoke runner verifies hermetic inputs, provisions missing media tools without replacing a complete existing local installation, installs Chromium, and runs the required specs. Linux CI can set `LOCAL_STREAMER_PLAYWRIGHT_INSTALL_DEPS=true` to request Playwright's browser OS dependencies. Host package installation is an intentional setup action, not an invisible test dependency.

For a focused browser investigation after prerequisites are installed:

```bash
pnpm test:e2e tests/e2e/player-browser-playback.spec.ts
```

Both entrypoints always allocate a temporary [runtime workspace](../tests/support/create-runtime-test-workspace.ts), seed accounts/metadata from shared fixture authorities, copy tracked playback assets, build/start the Node server, and clean up test-owned state. [Playwright configuration](../playwright.config.ts) uses one worker, explicit locale/timezone, no server reuse, and tracing off. Do not add a flag that switches the normal suite to a developer's vault.

Vitest, runtime, and browser runners scrub public runtime overrides and disable Vite environment-file loading. Tests must seed their own explicit environment rather than depend on shell secrets or the real local environment file. Shared fixture secrets belong in [runtime-test-env](../tests/support/runtime-test-env.ts); do not print or duplicate their values in guides or reports.

## Fixtures and maintenance are different

- Packaged playback fixtures live under [tests/fixtures/playback](../tests/fixtures/playback/README.md); their [manifest](../tests/support/playback-fixture-manifest.ts) defines ownership.
- Upload tests use the tracked [upload sample](../tests/fixtures/upload/smoke-upload.mp4) or explicitly generated temporary media.
- Never source a required test from ignored `storage/`, untracked user media, or an existing browser profile.
- `pnpm backfill:browser-playback-fixtures` is an explicit maintenance operation for deliberately selected runtime state. Playwright does not automatically run it against a local vault.
- `pnpm storage:seed-demo` queues an owned demo job for the application's worker; it is not an alternative hidden browser-fixture setup or a synchronous publication command.

## Personal browser QA

For runtime-sensitive rendered flows, use an isolated fixture-backed server and fresh browser context through Playwright MCP or equivalent tooling. Observe the changed outcome directly: actual login and destination, an upload job reaching publication, a persisted management action, or video time advancing with decoded/rendered frames. A loading label disappearing is not playback proof.

Authenticated media traces may expose tokens, cookies, licenses, and keys. Keep trace/HAR capture off, avoid request-body/header dumps, and keep sanitized screenshots/results outside the repository. Use the [playback contract](playback.md) to distinguish codec/EME support failures from routing/session defects.

`pnpm dev` is a trusted local development convenience that explicitly loads an optional local environment file. It is not the isolated test entrypoint or a production deployment. Do not expose it publicly or put media/secrets/databases under `public/`. Intentional ad-hoc investigation on a configured developer server is not hermetic completion evidence.

## Failure triage and CI

- Missing manifest/token requests usually indicate route/session wiring; missing or rejected media tracks can indicate codec/package compatibility. Check actual decoded frames and sanitized request categories, not raw credentials.
- A job accepted with HTTP `202` is not successful ingest. Inspect its owner-scoped state and resulting ready video.
- A failing cleanup or leaked child process is a runtime failure, not a reason to reuse a server or delete storage.
- Reproduce the same failing command and pinned runtime in an exact clean checkout before claiming CI parity. See the [CI reproduction guide](LOCAL_GITHUB_ACTIONS_CI_REPRODUCTION.md).
- `pnpm check:runtime` is the normal runtime escalation gate. `pnpm check:docker-worktree` is a heavy container diagnostic, not its replacement.
