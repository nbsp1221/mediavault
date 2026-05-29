# Video Access Milestone 6 QA Verification Checklist

Status: Executed - Pass
Date: 2026-05-29
Owner: Codex QA verification pass
Scope: Executable QA checklist for owner-only public/private video visibility management.

Depends on:

- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/product-spec.md`
- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/test-spec.md`
- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/implementation-plan.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`
- `docs/E2E_TESTING_GUIDE.md`

External QA documentation references:

- IEEE 829-style test plans: scope, test items, approach, pass/fail criteria, environment, risks, and approvals.
  `https://www.testriq.com/test-plan-template`
- Software test plan templates: testing activities, objectives, deliverables, risks, entry and exit criteria.
  `https://www.softwaretestingmaterial.com/test-plan-template/`
- Test plan versus test strategy: strategy is the higher-level approach, while a plan is release or feature execution detail.
  `https://www.browserstack.com/guide/test-plan-vs-test-strategy`

## 1. Purpose

This checklist is the executable QA document for Milestone 6. It converts the
product, test, and implementation specifications into concrete checks that can be
run before handoff or release.

The checklist should prove that visibility management:

- satisfies the owner-only product contract
- preserves anonymous public playback for public videos
- preserves private-video non-disclosure for anonymous users and non-owners
- uses the canonical server authorization path instead of UI-only trust
- behaves correctly in automated tests, Docker CI-like verification, and isolated
  browser QA

## 2. Scope

### In Scope

- Owner `private -> public` visibility change.
- Owner `public -> private` visibility change.
- Confirmation step for publishing.
- Immediate visibility effect across home, player, thumbnail, token, manifest,
  segment, and ClearKey surfaces.
- Anonymous and authenticated non-owner denial behavior.
- Quick View visibility-management UI.
- Server route, use-case, persistence, and DTO contracts.
- Cache and protected mutation response behavior relevant to this milestone.
- Automated and manual/browser verification evidence.

### Out Of Scope

- Public upload.
- Public signup.
- Public URL copy or share controls.
- Playlist visibility.
- Owner transfer.
- Audit history UI.
- CDN/search-engine behavior.
- Real-time multi-tab synchronization.
- Recall of bytes already loaded into a browser before privatization.

## 3. Entry Criteria

| ID | Check | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| ENT-01 | Product, test, and implementation specs are present in this folder. | File paths | Pass |  |
| ENT-02 | Working tree changes are intentional and reviewed before QA execution. | `git status --short` | Pass | Reviewed during QA; no unrelated revert or cleanup was performed. |
| ENT-03 | Required dependencies are installed with Bun. | `bun install` if needed | Pass | Do not use other package managers. |
| ENT-04 | No hidden local `.env` or persistent `storage/` state is required for tests. | Verification command output | Pass | Required by verification contract. |

## 4. Automated Verification Checklist

| ID | Check | Command or Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| AUTO-01 | Lint passes. | `bun run lint` | Exit 0 | Pass |  |
| AUTO-02 | Typecheck passes. | `bun run typecheck` | Exit 0 | Pass |  |
| AUTO-03 | Full Vitest and Bun smoke suite passes. | `bun run test` | Exit 0 | Pass | 186 Vitest files / 865 tests, dev-auth smoke 7 pass, bun-auth smoke 4 pass. |
| AUTO-04 | Coverage gate passes. | `bun run test:coverage` | Exit 0 | Pass |  |
| AUTO-05 | Build passes. | `bun run build` | Exit 0 | Pass |  |
| AUTO-06 | Required base gate passes. | `bun run check` | Exit 0 | Pass | Required before handoff; changed mutation score passed at 73.54 against the configured 70 threshold. |
| AUTO-07 | E2E smoke passes. | `bun run verify:e2e-smoke` | Exit 0 | Pass | 14 Chromium tests passed. |
| AUTO-08 | Docker CI-like verification passes. | `bun run verify:ci-worktree:docker` | Exit 0 | Pass | Docker `bun run check` and Docker E2E smoke both passed. |

## 5. Unit And Module Checklist

| ID | Check | Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| UNIT-01 | Visibility value object accepts only `private` and `public`. | Test output | Invalid values rejected | Pass |  |
| UNIT-02 | Owner can change private video to public. | Use-case test | Success with canonical public video | Pass |  |
| UNIT-03 | Owner can change public video to private. | Use-case test | Success with canonical private video | Pass |  |
| UNIT-04 | Same-state owner request is a successful no-op. | Use-case test | Success without unintended mutation | Pass |  |
| UNIT-05 | Anonymous viewer cannot mutate visibility. | Use-case or route test | Authentication required or neutral denial by layer | Pass | Route must require auth before use-case. |
| UNIT-06 | Non-owner cannot mutate another user's public video. | Use-case test | Forbidden, unchanged | Pass |  |
| UNIT-07 | Non-owner cannot infer another user's private video. | Use-case test | Missing/neutral denial, unchanged | Pass |  |
| UNIT-08 | Invalid visibility does not mutate storage. | Use-case test | Validation failure, unchanged | Pass |  |
| UNIT-09 | Visibility mutation does not overwrite metadata. | Repository/use-case test | Title, description, tags, media paths, owner unchanged | Pass |  |

## 6. Server And Persistence Contract Checklist

| ID | Check | Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| SRV-01 | Visibility route is protected before JSON/body validation. | Route test or source review | Unauthenticated mutation returns protected auth response | Pass | Prevents validation oracle. |
| SRV-02 | Owner `private -> public` route succeeds. | Integration test | 200, success body, persisted public | Pass |  |
| SRV-03 | Owner `public -> private` route succeeds. | Integration test | 200, success body, persisted private | Pass |  |
| SRV-04 | Owner invalid visibility fails safely. | Integration test | 400, persisted state unchanged | Pass |  |
| SRV-05 | Authenticated non-owner public mutation fails. | Integration test | 403, persisted state unchanged | Pass | Public existence is already visible. |
| SRV-06 | Authenticated non-owner private mutation is non-disclosing. | Integration test | 404 or equivalent neutral response, unchanged | Pass |  |
| SRV-07 | Missing target is non-disclosing. | Integration test | 404 or equivalent neutral response | Pass |  |
| SRV-08 | Unsupported method does not mutate visibility. | Route test | 405, unchanged | Pass | Added explicit runtime route contract coverage during QA. |
| SRV-09 | Authenticated mutation responses are not publicly cacheable. | Header assertion | `Cache-Control: private, no-store`; `Vary: Cookie` | Pass | Added `Vary: Cookie` route assertions during QA. |
| SRV-10 | Final persistence update is owner-scoped. | Source review and test | `ownerId` participates in the write boundary | Pass | Prevents stale authorization/write races. |

## 7. UI And Browser-Visible Checklist

| ID | Check | Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| UI-01 | Home card shows `Private` badge for private videos. | UI test or browser QA | Badge visible only for private videos | Pass |  |
| UI-02 | Home card does not show a public badge. | UI test or browser QA | No public badge | Pass | Product decision. |
| UI-03 | Home card does not expose direct visibility controls. | UI test or browser QA | Visibility controls absent on card | Pass | Quick View only. |
| UI-04 | Owner Quick View shows current visibility state. | UI test or browser QA | `Visibility: Private` or `Visibility: Public` | Pass |  |
| UI-05 | Owner Quick View exposes visibility controls only when `permissions.canManageVisibility` is true. | UI test | Controls hidden otherwise | Pass | No client owner guessing. |
| UI-06 | `private -> public` requires confirmation. | UI test or browser QA | Confirmation copy appears before mutation | Pass |  |
| UI-07 | Publish confirmation uses approved warning copy. | UI test or browser QA | Copy matches product spec | Pass |  |
| UI-08 | `public -> private` does not require confirmation. | UI test or browser QA | Immediate mutation attempt | Pass | Privacy restoration path. |
| UI-09 | Pending mutation disables conflicting controls. | UI test | No double-submit or edit/delete race | Pass |  |
| UI-10 | Successful publish shows approved success message. | UI test or browser QA | `Visibility updated to Public.` | Pass |  |
| UI-11 | Successful privatize shows approved success message. | UI test or browser QA | `Visibility updated to Private.` | Pass |  |
| UI-12 | Failed mutation shows generic retryable failure message. | UI test | `Visibility could not be updated. Try again.` | Pass |  |
| UI-13 | Edit Info mode does not expose visibility controls. | UI test or browser QA | Visibility controls hidden while editing metadata | Pass |  |
| UI-14 | Anonymous and non-owner Quick View do not expose management controls. | UI test or browser QA | No visibility controls | Pass |  |

## 8. Access And Playback Regression Checklist

| ID | Check | Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ACC-01 | After owner publishes, anonymous home includes the video. | E2E/browser QA | Video discoverable | Pass |  |
| ACC-02 | After owner publishes, anonymous player route opens. | E2E/browser QA | HTTP 200 / visible player | Pass |  |
| ACC-03 | After owner publishes, anonymous thumbnail request succeeds. | E2E/browser QA | HTTP 200 | Pass |  |
| ACC-04 | After owner publishes, anonymous token request succeeds. | E2E/browser QA | HTTP 200 | Pass |  |
| ACC-05 | After owner publishes, anonymous manifest request succeeds. | E2E/browser QA | HTTP 200 | Pass |  |
| ACC-06 | After owner publishes, anonymous segment request succeeds. | E2E/browser QA | HTTP 200 | Pass |  |
| ACC-07 | After owner publishes, anonymous ClearKey request succeeds. | E2E/browser QA | HTTP 200 | Pass |  |
| ACC-08 | After owner privatizes, anonymous home excludes the video. | E2E/browser QA | Video no longer discoverable | Pass |  |
| ACC-09 | After owner privatizes, anonymous player route is denied. | E2E/browser QA | 404 or equivalent non-disclosing response | Pass |  |
| ACC-10 | After owner privatizes, anonymous thumbnail request is denied. | E2E/browser QA | 404 or equivalent non-disclosing response | Pass |  |
| ACC-11 | After owner privatizes, anonymous token request is denied. | E2E/browser QA | 404 or equivalent non-disclosing response | Pass |  |
| ACC-12 | After owner privatizes, old anonymous manifest URL is denied. | E2E/browser QA | 404 or equivalent non-disclosing response | Pass |  |
| ACC-13 | After owner privatizes, old anonymous segment URL is denied. | E2E/browser QA | 404 or equivalent non-disclosing response | Pass |  |
| ACC-14 | After owner privatizes, old anonymous ClearKey request is denied. | E2E/browser QA | 404 or equivalent non-disclosing response | Pass |  |
| ACC-15 | Authenticated non-owner can view public video but cannot manage visibility. | E2E/browser QA or integration test | Read/play allowed; mutation forbidden | Pass |  |
| ACC-16 | Authenticated non-owner cannot discover or access private video. | E2E/browser QA or integration test | Missing/neutral denial | Pass |  |

## 9. Security Checklist

| ID | Check | Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | Server owns authorization; UI capability is not trusted as authority. | Source review and tests | Forged request still denied | Pass |  |
| SEC-02 | Route uses protected mutation session helper. | Source review | Same protected auth boundary as update/delete | Pass |  |
| SEC-03 | Visibility mutation uses canonical `VideoAccessPolicy` manage-visibility path. | Source review | No route-local owner predicate | Pass |  |
| SEC-04 | Private inaccessible malformed requests do not leak validation detail. | Integration test | Neutral missing response | Pass |  |
| SEC-05 | Anonymous public mutation requires authentication. | Integration/browser HTTP check | 401 protected auth response | Pass |  |
| SEC-06 | Public-to-private invalidates subsequent access checks for old public media URLs/tokens. | E2E/browser QA | Subsequent requests fail closed | Pass |  |
| SEC-07 | Owner/user identity is not exposed to anonymous public responses. | Source review or response inspection | No owner ID/name/uploader hint | Pass |  |
| SEC-08 | Error responses do not expose raw internal error messages. | Route test/source review | Generic external error copy | Pass |  |
| SEC-09 | Mutation responses are not publicly cacheable. | Header checks | private/no-store and Cookie variance | Pass |  |

## 10. Playwright MCP Browser QA Checklist

Run this section in an isolated runtime workspace with a fresh browser context.
Record the base URL, account used, and runtime storage path in the evidence log.

| ID | Check | Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| BR-01 | Start the app with hermetic runtime storage. | Dev server log and base URL | Server reachable | Pass | Base URL `http://127.0.0.1:5173`; storage `/tmp/local-streamer-runtime-pVljNM/storage`. |
| BR-02 | Log in as the owner. | Browser observation | Owner home loads | Pass |  |
| BR-03 | Open owner private video Quick View. | Browser observation | Dialog opens, private state visible | Pass |  |
| BR-04 | Trigger `Make Public`. | Browser observation | Confirmation appears before mutation | Pass |  |
| BR-05 | Confirm publish. | Browser observation | Public success message and state visible | Pass |  |
| BR-06 | In anonymous context, request token, manifest, segment, and ClearKey. | Network/HTTP evidence | All required public media requests succeed | Pass | Anonymous token, manifest, segment, ClearKey, and thumbnail returned 200 after publish. |
| BR-07 | In anonymous browser, discover/open the public video. | Browser observation | Public video is reachable | Pass | Anonymous home exposed the video and player route rendered it after publish. |
| BR-08 | Return as owner and trigger `Make Private`. | Browser observation | Private success message and state visible | Pass |  |
| BR-09 | In a fresh anonymous context, retry home/player/token/thumbnail/old media URLs. | Network/HTTP evidence | Requests fail closed or video disappears | Pass | Anonymous home count returned 0; player, token, thumbnail, old manifest, old segment, and old ClearKey returned 404 after privatize. |
| BR-10 | Attempt anonymous direct visibility mutation. | Network/HTTP evidence | 401 protected auth response, unchanged state | Pass | Response body was `{ success: false, error: "Authentication required" }`. |
| BR-11 | Inspect browser console. | Playwright console output | No app runtime errors during QA | Pass | Playwright console inspection reported 0 errors before server shutdown. |

## 10.1 Extended Manual Browser QA Checklist

Run this section against a development server with real browser upload flows.
The goal is to prove that newly uploaded media, not only seeded playback
fixtures, follows the same visibility and cross-account access contracts.

| ID | Check | Evidence | Expected Result | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| XBR-01 | Start the app with admin API enabled and create at least two real QA accounts. | Dev server log and admin API responses | Owner and non-owner accounts can log in | Pass | Created `qa-owner` and `qa-other` through `POST /api/admin/users`; both logged in through the browser. |
| XBR-02 | Upload a video through the browser as the owner account. | Browser observation and commit response | Upload commits and appears in owner library | Pass | `qa-owner` uploaded `tests/fixtures/upload/smoke-upload.mp4`; commit returned video `f21331e8-8638-4e77-86f7-670cb1277f6c`. |
| XBR-03 | Verify the uploaded video is initially private or otherwise not anonymously discoverable before publish. | Anonymous browser and HTTP evidence | Anonymous home/player/media access fail closed before publish | Pass | Anonymous home count was 0; token, player, and thumbnail returned 404 before publish. |
| XBR-04 | Publish the uploaded owner video through Quick View. | Browser observation | Confirmation appears, then public success state is visible | Pass | Quick View showed private state, required publish confirmation, then showed `Visibility updated to Public.` |
| XBR-05 | Verify anonymous access to the newly published uploaded video. | Anonymous browser and HTTP evidence | Home/player/token/manifest/segment/ClearKey/thumbnail succeed where applicable | Pass | Anonymous home/player visible; token, manifest, segment, ClearKey, thumbnail, and player returned 200. |
| XBR-06 | Verify non-owner access to the newly published owner video. | Non-owner browser and HTTP evidence | Public playback is allowed, visibility management controls are absent, mutation is forbidden | Pass | `qa-other` could view/play the public video, saw only Watch control, and authenticated mutation returned 403 with private/no-store and `Vary: Cookie`. |
| XBR-07 | Privatize the uploaded owner video through Quick View. | Browser observation | Private success state is visible | Pass | Quick View showed `Visibility updated to Private.` |
| XBR-08 | Verify anonymous access is revoked after privatization. | Anonymous browser and HTTP evidence | Home/player/token/thumbnail/old manifest/old segment/old ClearKey fail closed | Pass | Anonymous home count was 0; player, token, thumbnail, old manifest, old segment, and old ClearKey returned 404; anonymous mutation returned 401. |
| XBR-09 | Verify non-owner access is revoked after privatization. | Non-owner browser and HTTP evidence | Home/player/token/thumbnail/mutation fail closed or are forbidden without private existence leakage | Pass | `qa-other` home count was 0; player/token/thumbnail/old media returned 404; authenticated mutation returned neutral 404 with private/no-store and `Vary: Cookie`. |
| XBR-10 | Upload a private video as the non-owner account and verify the owner cannot discover or manage it. | Owner browser and HTTP evidence | Owner account cannot see, play, or mutate the non-owner private upload | Pass | `qa-other` uploaded video `0c998fff-1359-4bb7-9b40-381d88d4ef0d`; `qa-owner` home count was 0, player/token/thumbnail returned 404, and mutation returned neutral 404. |
| XBR-11 | Inspect browser console after the extended QA run. | Playwright console output | No app runtime errors during QA | Pass | Playwright console inspection reported 0 errors before server shutdown. |

## 11. Exit Criteria

| ID | Check | Evidence | Status | Notes |
| --- | --- | --- | --- | --- |
| EXIT-01 | All P0 automated tests pass. | Command outputs | Pass |  |
| EXIT-02 | `bun run check` passes. | Command output | Pass | Required base gate. |
| EXIT-03 | Docker CI-like verification passes. | Command output | Pass | Required escalation gate. |
| EXIT-04 | Playwright MCP browser QA passes. | Checklist evidence | Pass | Required browser-visible runtime-sensitive gate. |
| EXIT-05 | No unresolved blocker or important subagent review issue remains. | Review summary | Pass | Previous implementation review had no unresolved blocker/important issue; this QA pass found and fixed missing route assertions. |
| EXIT-06 | Any remaining risks are documented explicitly. | Risk section | Pass | See RISK-01. |

## 12. Evidence Log

| Time | Executor | Item IDs | Evidence | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-05-29 | Codex | UNIT-01..UNIT-09, SRV-01..SRV-10, UI-01..UI-14 | Focused Vitest command covering visibility use case, value object, repository, composition, route runtime, and home UI tests | Pass | 8 files / 64 tests passed. |
| 2026-05-29 | Codex | AUTO-01..AUTO-06, EXIT-01..EXIT-02 | `bun run check` | Pass | Lint, typecheck, tests, coverage, changed coverage, mutation gate, build, and Bun smoke gates passed. |
| 2026-05-29 | Codex | AUTO-03 | `bun run test` | Pass | 186 Vitest files / 865 tests, dev-auth smoke 7 pass, bun-auth smoke 4 pass. |
| 2026-05-29 | Codex | AUTO-07 | `bun run verify:e2e-smoke` | Pass | 14 Chromium tests passed. |
| 2026-05-29 | Codex | AUTO-08, EXIT-03 | `bun run verify:ci-worktree:docker` | Pass | Docker `bun run check` and Docker E2E smoke passed. |
| 2026-05-29 | Codex | BR-01..BR-11, ACC-01..ACC-14, SEC-05..SEC-06 | `bun dev` with Playwright MCP browser QA | Pass | Publish made anonymous token/manifest/segment/ClearKey/thumbnail return 200; privatize made anonymous home/player/token/thumbnail/old media URLs fail closed; anonymous mutation returned 401; console had 0 errors. |
| 2026-05-29 | Codex | XBR-01..XBR-11, ACC-15..ACC-16, SEC-01, SEC-05..SEC-09 | `bun dev` with admin-created QA accounts and Playwright MCP browser upload QA | Pass | Created `qa-owner`/`qa-other`, uploaded real browser-selected videos as both accounts, verified owner publish/privatize, anonymous public/private access changes, authenticated non-owner public 403, authenticated private neutral 404, and no browser console errors. |

## 13. Open Risks And Follow-Ups

| ID | Risk or Follow-up | Severity | Owner | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| RISK-01 | Stryker may emit child-process timeout or abort warnings even when the configured mutation score passes. | Low | Engineering | Observed | Observed during `bun run check` and Docker verification; final commands exited 0 and the configured threshold passed. |
