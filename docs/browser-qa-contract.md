# Browser QA contract

Browser QA proves outcomes that module tests and HTTP responses cannot: real cookie behavior, navigation, rendered controls, upload/management state, and decoded playback. It complements the [verification gates](verification-contract.md), not replaces them.

## When it is required

- Browser-visible work requires `pnpm test:e2e:smoke` in addition to its base gates.
- Runtime-sensitive and browser-visible changes require Playwright MCP or equivalent isolated personal browser QA when HTTP checks and the standard smoke suite cannot establish the changed success condition. Login/logout, session-dependent navigation, playback wiring, and rendered owner workflows are common cases.
- Pure server policies with sufficient lower-layer coverage and documentation-only changes do not independently require a new personal browser session. Their other required gates still apply.

Run deterministic lower-layer checks first, then required browser smoke, then the focused personal flow. The [E2E guide](E2E_TESTING_GUIDE.md) explains the supported browser entrypoints.

## Isolation and credential safety

Use test-owned temporary storage, explicit fixture environment, tracked/generated media, a dedicated server address, and a clean browser context. Every repository Playwright invocation creates isolated state; there is no developer-vault mode or existing-server reuse. Coordinate ports with other verification work instead of taking over a running server.

Do not use the real local environment file, ignored uploaded videos, an existing account/session, cached browser storage, or arbitrary files from a developer vault as hidden inputs. Never delete local data or clear another user's browser profile to make QA reproducible. Keep keys, databases, and sources out of static assets.

Tracing stays off: authenticated requests and licenses contain cookies, bearer tokens, and ClearKey material. Do not collect raw HARs, request/response bodies, auth headers, session dumps, or key-bearing traces. Read fixture credentials inside the QA process, never print them. Mask sensitive UI when taking screenshots and keep sanitized evidence outside Git.

## Observe the actual outcome

| Changed flow              | Direct browser evidence                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login/logout and sessions | Sign in through the form, navigate to the intended protected page, sign out, and observe denied/revoked access as relevant                                                                                 |
| Navigation/shell/layout   | Use visible links and controls, verify the destination and rendered state, and inspect relevant narrow/desktop viewports                                                                                   |
| Upload/processing         | Transfer a tracked fixture, accept metadata, observe server-backed job state, and distinguish acceptance from successful publication; reload/navigation must retain the job                                |
| Owner management          | Perform the actual edit/visibility/playlist/destructive confirmation flow and observe persisted results or the correct denial/error                                                                        |
| Playback                  | Start the real encrypted asset, observe advancing playback time **and** increasing decoded-frame evidence or rendered video-frame callbacks; test relevant seek, controls, and source/playlist transitions |

A mounted player, HTTP `200`, successful license exchange, nonzero metadata dimensions, `canplay`, or a vanished loading label alone does not prove decoded video. A playable public video also does not prove private/other-owner denial or session revocation. Exercise the corresponding negative path when authorization changes.

Check sanitized console/network outcomes for failures, unexpected destinations, and repeated engine/source initialization. Token refresh should not reset the active media engine. Do not disable authorization, encryption, or browser security to manufacture a pass. Distinguish an unsupported browser/codec/EME environment from an application defect; do not claim unsupported devices were validated.

## Tools and fallback

Prefer Playwright MCP when available for personal QA; an equivalent browser automation tool or an isolated manually operated browser is acceptable when it observes the same outcome. If MCP is unavailable, run the required smoke suite, use the isolated fallback for any remaining browser-only condition, and report the tool/path and limitation. Do not silently skip the condition or substitute an HTTP-only check.

For fixture-dependent changes, verify the flow from a clean export or equivalent tracked-input proof as well as the working tree. [Playback](playback.md) documents engine, codec, and encryption limits.

## Handoff evidence

Report the flow, tool/fallback, fixture provenance, directly observed success condition, negative cases checked, and unresolved issues. Keep a failed or unverified browser condition explicit even when lower layers pass. Do not put execution reports, drifting test counts, secret values, or QA artifacts into permanent product documentation.
