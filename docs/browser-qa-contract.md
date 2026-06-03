# Browser QA Contract

This document defines when browser QA is required, what level of browser validation is expected, and how browser verification should be executed without relying on hidden local state.

## Purpose

Use browser QA to validate behavior that HTTP-only checks cannot prove:

- real navigation and redirected page flows
- authenticated browser cookie behavior
- player surface rendering
- browser-driven playback request wiring
- user-visible regressions in owner flows

## Decision Rules

### Browser QA is required when a change touches:

- login or logout UI
- protected page navigation
- `player` route layout or player shell behavior
- thumbnail, manifest, token, or media requests that depend on browser session state
- browser-visible route wiring regressions
- flows where the success condition must be observed in rendered UI

### Browser QA is optional when a change touches:

- pure server-side policies already covered by module or integration tests
- internal application code with no user-visible path changes
- documentation-only changes

### Playwright MCP or manual browser QA is required when:

- the changed flow is runtime-sensitive and browser-visible
- the required confidence cannot be reached with HTTP-level checks plus the standard browser smoke suite
- the task changes cookies, navigation, playback request wiring, or rendered owner workflows

## Expected QA Order

1. Run the default verification contract first.
2. Run HTTP-level or integration checks next when they can prove most of the behavior deterministically.
3. Run the required browser smoke command when the change is browser-visible:

```bash
bun run test:e2e:smoke
```

4. Escalate to Playwright MCP or manual browser QA when the changed flow still depends on real browser state or rendered UI confirmation.

## Isolation Rules

- Do not rely on repo-local auth DB state, repo-local uploaded files, or repo-local browser storage as hidden fixtures.
- Do not rely on ambient `.env` values. Seed the required environment explicitly.
- Prefer isolated temporary workspaces for runtime QA when the flow touches auth or storage.
- Prefer checked-in test fixtures or generated temporary fixtures over ad-hoc local machine state.
- For playback/browser smoke, do not use ignored `storage/` assets as fixture sources. Use tracked test-owned fixtures or generators that run inside the same authority scripts and CI provisioning path.

## Playwright MCP Expectations

When Playwright MCP is used, the QA pass should verify the user-visible success condition directly, not just navigation side effects.

Typical expectations:

- confirm login succeeds in-browser
- confirm protected navigation lands on the intended page
- confirm the target flow shows the expected success or error state
- inspect browser console or network activity when playback or route wiring is involved

## Fallback When Playwright MCP Is Unavailable

If Playwright MCP is unavailable or unstable:

- do not silently skip browser QA
- fall back to the required browser smoke suite first
- if higher confidence is still needed, run an isolated built-server or dev-server manual QA flow with explicit seeded environment and temporary runtime state
- report that the fallback path was used and why

## Reporting Contract

A browser QA report should state:

- which flow was exercised
- whether Playwright MCP or fallback QA was used
- which success condition was directly observed
- whether any blocker or important browser-visible issue remains
- whether the exercised runtime state came from tracked fixtures or another explicitly documented hermetic seed path

## Relationship To Other Docs

- `docs/verification-contract.md` defines the base verification bundle and escalation matrix.
- `docs/E2E_TESTING_GUIDE.md` documents the practical test layers and workflow details.
