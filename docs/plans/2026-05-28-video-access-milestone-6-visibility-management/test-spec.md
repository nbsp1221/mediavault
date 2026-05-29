# Video Access Milestone 6 Visibility Management Test Specification

Status: Draft test specification
Date: 2026-05-28
Owner: Codex test specification pass
Scope: Define the verification contract for owner-only public/private video visibility management.

Depends on:

- `docs/plans/2026-05-28-video-access-milestone-6-visibility-management/product-spec.md`
- `docs/plans/2026-05-22-video-access-visibility-milestone-plan.md`
- `docs/plans/2026-05-27-video-access-milestone-5-anonymous-public-access-plan.md`
- `docs/verification-contract.md`
- `docs/browser-qa-contract.md`

External testing references used:

- Playwright Best Practices: test user-visible behavior, isolate tests, use resilient locators.
  `https://playwright.dev/docs/best-practices`
- Testing Library query guidance: prefer semantic user-facing queries.
  `https://testing-library.com/docs/queries/about`
- Vitest Testing in Practice: test behavior rather than implementation details.
  `https://vitest.dev/guide/learn/testing-in-practice`
- Martin Fowler Test Pyramid: keep a balanced test portfolio with broad UI tests reserved for high-value flows.
  `https://martinfowler.com/bliki/TestPyramid.html`
- OWASP Authorization Testing and Authorization Cheat Sheet: verify access control across roles, objects, and operations.
  `https://owasp.org/www-project-web-security-testing-guide/v41/`
  `https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html`

## 1. Intent And Core Contracts

Milestone 6 completes the public/private access model by letting the authenticated
owner change an owned video's visibility. Tests must prove the product contract, not
the internal implementation shape.

The core contracts are:

- only the owner can change video visibility
- `private` and `public` are the only valid visibility states
- new uploads remain private by default
- `private -> public` requires owner confirmation in Quick View
- `public -> private` does not require confirmation and prioritizes restoring privacy
- Quick View is the only Milestone 6 owner-facing visibility-management surface
- Home cards show only the `Private` badge; public videos have no badge
- Edit Info and player surfaces do not expose visibility controls
- `permissions.canManageVisibility` is the canonical UI capability for this milestone
- same-state owner requests succeed as no-ops
- malformed or forged requests do not change video state
- malformed requests cannot reveal private-video existence
- anonymous public management attempts require authentication
- authenticated non-owner public management attempts are forbidden
- private inaccessible management attempts stay missing/neutral
- visibility changes are reflected consistently across home, player, thumbnail,
  token, manifest, segment, and ClearKey routes
- public-to-private blocks subsequent protected media requests, including old public
  tokens, without promising recall of already-loaded client bytes
- stale public cache responses cannot be treated as authoritative access
- visibility management remains separate from metadata editing

## 2. Test Design Principles

Tests should follow these project-specific rules:

- Test externally observable behavior and contracts before internal method calls.
- Prefer focused unit tests for pure policy and input matrix behavior.
- Prefer integration tests for server route/use-case/storage contracts because most
  risk is in authorization crossing module boundaries.
- Use UI tests for Quick View user-facing behavior and accessibility-visible copy.
- Use E2E/browser smoke only for the highest-value end-to-end owner and anonymous
  flows, because broad browser tests are slower and more fragile than module and
  route tests.
- Keep tests hermetic. Do not depend on ambient `.env`, ignored `storage/`, local
  browser state, or manual fixture setup.
- Name tests by behavior and expected contract, not by implementation method.
- Use role/name and semantic queries for UI where possible. Use explicit stable
  contracts only when a behavior has no natural accessible surface.
- Avoid mocks when real in-memory, temporary SQLite, or existing runtime workspace
  helpers can prove the contract without excessive cost.
- Use mocks/fakes only to isolate failures that are otherwise hard to induce
  deterministically, such as network failure after submission or a use-case returning
  a specific denial result.

## 3. Scope

### In Scope

- Domain/application policy tests for visibility changes.
- Use-case tests for owner, anonymous, non-owner, same-state, invalid input, and
  missing/deleted behavior.
- Repository or integration tests proving persisted visibility changes are read by
  subsequent scoped reads.
- Route contract tests for visibility-management requests and denial response
  classes.
- UI tests for Home card badge behavior, Quick View visibility controls,
  confirmation, inline success/error, and Edit Info separation.
- Playback/media integration tests proving changed visibility affects token,
  manifest, segment, ClearKey, thumbnail, player, and home reads.
- E2E smoke for one full `private -> public` and one full `public -> private`
  owner workflow using hermetic runtime fixtures.
- Regression tests preserving Milestone 5 private non-disclosure and anonymous
  public playback.
- Architecture guardrails preventing route/UI code from hand-rolling owner or
  visibility predicates.

### Out Of Scope

- Public upload.
- Public signup.
- Public URL copy/share controls.
- Playlist visibility.
- Owner transfer.
- Audit history UI.
- Real-time multi-tab synchronization.
- Recall of already-loaded client-side video bytes.
- Search engine indexing, CDN behavior, or cross-origin media delivery.
- Broad visual regression testing beyond ensuring no visible overlap or missing
  required controls in browser QA.
- Testing exact internal route names or database SQL when an external contract can
  be tested instead.

## 4. Test Levels And Priority

| Level | Priority | Purpose |
| --- | --- | --- |
| Unit/module | P0 | Validate policy matrix, input validation, no-op behavior, and use-case outcomes cheaply. |
| Integration/contract | P0 | Validate route, persistence, read-scope, media, and denial contracts across real boundaries. |
| UI component | P0 | Validate Quick View and Home card visible behavior without browser runtime cost. |
| E2E smoke | P0 | Prove the critical owner/anonymous workflows in a real browser/runtime path. |
| Regression/architecture | P0 | Prevent reintroducing private leaks, route-local predicates, or capability guessing. |
| Docker/runtime | P1 | Required by project verification because this change is auth/playback/route/storage sensitive. |
| Manual/Playwright MCP browser QA | P1 | Required after implementation to directly observe the changed browser-visible owner flow. |

P0 means required before claiming Milestone 6 implementation complete. P1 means
required verification escalation before handoff, but not necessarily a new test file
category.

## 5. Unit And Module Test Scenarios

### 5.1 Visibility Value Object Or Input Policy

Required scenarios:

- accepts `private`
- accepts `public`
- rejects missing visibility
- rejects `null`
- rejects empty string
- rejects unknown string
- rejects wrong casing such as `PUBLIC`
- rejects wrong primitive type such as boolean, number, array, or object
- ignores or rejects irrelevant extra fields without changing visibility

Expected outcome:

- invalid values do not mutate state
- invalid values produce a validation failure only when the requester is allowed to
  know the target object

### 5.2 Visibility Change Use Case

Required scenarios:

- owner changes private video to public
- owner changes public video to private
- owner requests public for already-public video and receives success no-op
- owner requests private for already-private video and receives success no-op
- owner changes visibility after metadata edits and metadata remains unchanged
- owner changes visibility before/after metadata edits and visibility remains correct
- anonymous viewer cannot change visibility
- authenticated non-owner cannot change another user's public video visibility
- authenticated non-owner cannot distinguish another user's private video from a
  missing video
- malformed request against private or missing target does not expose validation
  detail to unauthorized viewers
- missing video returns missing/neutral
- deleted video returns missing/neutral and is not recreated
- stale or dangling authenticated viewer fails closed according to existing auth
  request-viewer behavior

Expected outcome:

- the use-case returns the current canonical visibility after success or no-op
- no failed path changes visibility
- denial reasons are privacy-preserving

### 5.3 Policy Matrix Regression

The existing `VideoAccessPolicy` matrix should remain true after visibility
management is added:

- public: anonymous and authenticated viewers can view/play
- public: only owner can edit/delete/manage visibility
- private: only owner can view/play/edit/delete/manage visibility

This should remain a compact table-driven module test rather than a broad route
test.

## 6. Integration And Contract Test Scenarios

### 6.1 Visibility Mutation Route Contract

Required scenarios:

- unauthenticated request against public video returns the existing protected action
  authentication-required response
- authenticated owner can change private to public
- authenticated owner can change public to private
- authenticated owner same-state request succeeds as no-op
- authenticated owner invalid visibility receives validation failure and storage is
  unchanged
- authenticated non-owner request against public video receives forbidden response
- authenticated non-owner request against private video matches missing/neutral
  response
- anonymous or non-owner malformed request against private video matches
  missing/neutral response instead of validation failure
- missing video matches missing/neutral response
- unsupported HTTP method does not mutate visibility
- state-changing request preserves existing protected mutation same-origin/CSRF
  policy

Assertions should cover externally observable status, body shape, error copy,
content type, and cache behavior where the product spec requires response
equivalence.

### 6.2 Persistence And Scoped Reads

Required scenarios:

- after private-to-public mutation, anonymous-scoped home/catalog read includes the
  video
- after private-to-public mutation, authenticated non-owner scoped read includes the
  video with `permissions.canManageVisibility === false`
- after public-to-private mutation, anonymous-scoped home/catalog read excludes the
  video
- after public-to-private mutation, authenticated non-owner scoped read excludes the
  video
- after public-to-private mutation, owner-scoped home/catalog read includes the video
  with private status and `permissions.canManageVisibility === true`
- public/private changes do not alter title, description, tags, genre, content type,
  duration, created date, thumbnail URL, media URL, or owner
- new upload commit still persists `private`

### 6.3 Media And Playback Consistency

The following route surfaces must be checked after each visibility transition in the
same isolated runtime:

- home data
- player route
- thumbnail route
- token route
- manifest route
- ClearKey route
- at least one valid audio or video segment route derived from the manifest

Required scenarios:

- private-to-public makes all public read/playback surfaces accessible to anonymous
  viewers
- public-to-private removes anonymous and non-owner access from all read/playback
  surfaces
- owner retains access to private media surfaces after public-to-private
- old public token fails after public-to-private for manifest, ClearKey, and at
  least one valid segment request
- denial responses for private inaccessible media routes still match missing video
  snapshots, following the Milestone 5 normalization style
- stale cache headers do not permit token, manifest, segment, ClearKey, thumbnail,
  or player responses to be treated as authoritative access after privatization

### 6.4 Capability Payload Contract

Required scenarios:

- owner payload has `permissions.canManageVisibility === true`
- anonymous public video payload has `permissions.canManageVisibility === false`
- authenticated non-owner public video payload has
  `permissions.canManageVisibility === false`
- anonymous and authenticated non-owner payloads do not include owner ID, owner name,
  uploader identity, or ownership hints
- UI-facing response can render the required Quick View management state without
  client-side owner ID guessing

### 6.5 Concurrency And Indeterminate Outcomes

Required scenarios:

- visibility request after delete returns missing/neutral and does not recreate the
  video
- overlapping metadata edit and visibility change do not overwrite each other's
  fields
- double submit of the same target state ends in the target state with no duplicate
  or contradictory response requirement
- network failure or rejected client request does not show success in the UI

These tests should remain focused. Do not attempt broad timing stress unless a
concrete race is found.

## 7. UI Component Test Scenarios

Use React Testing Library with `user-event` and semantic queries where possible.

### 7.1 Home Card

Required scenarios:

- private owner video shows `Private` badge
- public owner video shows no public badge
- home card never shows `Make Public` or `Make Private`
- anonymous and non-owner public cards do not show edit, delete, upload, or
  visibility-management actions

### 7.2 Quick View Visibility Section

Required scenarios:

- owner Quick View for private video shows `Visibility: Private` and `Make Public`
- owner Quick View for public video shows `Visibility: Public` and `Make Private`
- anonymous Quick View for public video does not show the visibility section
- authenticated non-owner Quick View for public video does not show the visibility
  section
- Quick View in Edit Info mode does not show visibility controls
- exiting Edit Info mode returns to the visibility section when the owner has
  `permissions.canManageVisibility`

### 7.3 Private-To-Public Confirmation

Required scenarios:

- clicking `Make Public` opens confirmation with exact copy:
  - `Make video public?`
  - `Anyone who can access this site can find and watch this video. You can make it private again later.`
  - `Make Public`
  - `Cancel`
- cancel keeps the video private and sends no mutation
- confirm sends one visibility change request
- success keeps Quick View open
- success updates visible state to `Visibility: Public`
- success shows `Visibility updated to Public.`
- failure keeps previous visible state and shows
  `Visibility could not be updated. Try again.`

### 7.4 Public-To-Private Immediate Action

Required scenarios:

- clicking `Make Private` does not show a confirmation dialog
- success keeps Quick View open
- success updates visible state to `Visibility: Private`
- success shows `Visibility updated to Private.`
- failure keeps previous visible state and shows
  `Visibility could not be updated. Try again.`

### 7.5 Pending State

Required scenarios:

- while a visibility change is pending, visibility controls do not accept another
  action for the same video
- a rejected request does not show success
- after failure, the owner can retry or close the dialog

## 8. E2E, Browser Smoke, And QA Scenarios

E2E should cover only workflows that require real browser/runtime confidence. Use
the existing hermetic runtime workspace and tracked playback fixtures.

### 8.1 Owner Publishes A Private Video

Flow:

1. Login as owner.
2. Open Quick View for an owner private fixture video.
3. Confirm `Make Public`.
4. Observe inline success and `Visibility: Public`.
5. Open a fresh anonymous browser context.
6. Verify the video appears on `/`.
7. Verify anonymous player opens.
8. Verify token, manifest, ClearKey, thumbnail, and at least one segment request
   succeed through the public pipeline.
9. Verify no upload, edit, delete, or visibility-management controls appear to the
   anonymous viewer.

### 8.2 Owner Makes A Public Video Private

Flow:

1. Login as owner.
2. Obtain an anonymous public token for a public fixture video before changing it.
3. Open Quick View as owner and click `Make Private`.
4. Observe inline success and `Visibility: Private`.
5. In a fresh anonymous context, verify the video no longer appears on `/`.
6. Verify anonymous player, thumbnail, token, manifest, ClearKey, and at least one
   segment route are denied with private non-disclosure behavior.
7. Retry old public token against manifest, ClearKey, and at least one valid segment;
   all must fail.
8. Verify owner can still see and play the private video.

### 8.3 Authenticated Non-Owner Public Read-Only

Flow:

1. Login as owner or use the existing authenticated non-owner fixture path.
2. View another user's public video.
3. Verify the video is visible and playable.
4. Verify `Make Public`, `Make Private`, edit, and delete controls are absent.
5. Direct visibility mutation attempt receives forbidden response.

### 8.4 Required Browser QA

After implementation, run Playwright MCP or equivalent isolated browser QA for:

- owner private-to-public confirmation and inline success
- owner public-to-private immediate action and inline success
- anonymous public visibility after publish
- anonymous denial after privatization

Browser QA should report the observed rendered UI state and whether fixture state
came from the hermetic runtime workspace.

## 9. Regression And Architecture Tests

Required regression tests:

- Milestone 5 anonymous public access suite still passes.
- Missing and inaccessible private media snapshots remain equivalent.
- Upload commit still defaults to private.
- Existing owner edit/delete behavior still passes.
- Existing playback token schema and media-route authorization tests still pass.

Required architecture tests:

- route and UI layers do not hand-roll `visibility === 'public' || ownerId === ...`
  predicates
- browser UI does not derive visibility-management authority from owner IDs
- visibility mutation uses approved library/application authorization seams
- route code does not bypass `VideoAccessPolicy`/read-scope contracts for media
  consistency

## 10. Test Data And Fixture Strategy

Required fixture set:

- owner private video
- owner public video
- other-user private video
- other-user public video
- missing UUID that cannot collide with seeded data
- valid playback assets for public/private transition tests
- at least one valid audio or video segment path derived from each test manifest

Fixture rules:

- Use tracked playback fixtures under `tests/fixtures/` or generated temporary
  copies from existing test-owned fixture helpers.
- Use isolated runtime workspaces for E2E and smoke.
- Do not read ignored repo-local `storage/`.
- Do not read ambient `.env`.
- Use shared runtime env fixture authority under `tests/support/runtime-test-env.ts`
  for production-like secrets.
- Reset or recreate data per test where mutation order matters.
- Prefer meaningful titles that make private leakage visible in assertions, such as
  `owner-private-playtime` and `other-private-playtime`.

## 11. Mock, Stub, And Fake Policy

Use real dependencies when:

- testing route behavior with auth/session results
- testing SQLite persistence and scoped reads
- testing media route access after visibility changes
- testing browser-visible workflows

Use fakes when:

- isolating pure application use cases from filesystem cleanup or media bytes
- forcing a use-case result that is hard to create through storage setup
- simulating network failure in UI component tests
- verifying pending UI state without running a full server

Avoid mocks that:

- assert internal function call order instead of external outcomes
- duplicate the implementation's authorization logic in test setup
- make route tests pass without proving server-side enforcement
- require hidden local state

## 12. What Tests Must Verify

Tests must verify:

- who can and cannot change visibility
- which visibility values are accepted
- whether visibility actually persists
- whether read/playback access changes on subsequent requests
- whether private-video existence remains hidden
- whether old public tokens fail after privatization
- whether UI controls appear only from `permissions.canManageVisibility`
- whether Quick View copy, confirmation, success, and error states match the product
  contract
- whether upload default remains private
- whether hermetic fixture and runtime rules are preserved

## 13. What Tests Must Not Verify

Tests must not verify:

- exact component internal state names
- exact hook implementation details
- exact SQL statement text unless no behavior-level assertion can prove the contract
- CSS class names, pixel colors, or layout internals unrelated to usability
- internal route helper names
- that already-loaded client-side video bytes are recalled after privatization
- public URL copy/share behavior
- playlist visibility behavior
- social/public-platform behavior

## 14. Verification Commands

Because Milestone 6 changes auth, route wiring, storage-backed metadata,
browser-visible UI, and playback/media authorization, implementation completion
requires:

```bash
bun run check
bun run verify:e2e-smoke
bun run verify:data-integrity
bun run verify:ci-worktree:docker
```

Run `bun run verify:docker-compose-smoke` if implementation changes production
startup, Docker runtime fixtures, production readiness, or media tool wiring. It is
not required solely for product-spec or test-spec documentation.

Use Playwright MCP or equivalent isolated browser QA after automated gates for the
changed owner visibility workflow.

## 15. Success Criteria

The test plan is complete when:

- P0 unit/module tests cover owner, anonymous, non-owner, same-state, invalid input,
  and missing/private non-disclosure cases
- P0 integration tests prove persistence, route denials, scoped reads, and media
  consistency after visibility changes
- P0 UI tests prove Quick View-only management, confirmation, inline feedback, and
  absence of controls for anonymous/non-owner viewers
- P0 E2E smoke proves private-to-public and public-to-private through real browser
  and media paths
- old public tokens fail after privatization on manifest, ClearKey, and at least one
  valid segment
- upload default private behavior remains covered
- architecture guards prevent route/UI authorization drift
- all required verification commands for the implemented change class pass
- browser QA directly observes the rendered owner workflow

## 16. Open Questions

None.
