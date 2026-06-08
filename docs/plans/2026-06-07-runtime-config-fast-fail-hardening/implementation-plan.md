# Runtime Config Fast-Fail Hardening Implementation Plan

Status: Implemented
Date: 2026-06-07
Owner: Codex planning pass
Scope: Make explicitly invalid runtime environment values fail fast instead of silently falling back to defaults.

Depends on:

- `docs/plans/2026-05-20-runtime-config-boundary-implementation-plan.md`
- `docs/plans/2026-05-02-production-startup-preflight-product-spec.md`
- `docs/plans/2026-05-02-production-startup-preflight-test-spec.md`
- `docs/verification-contract.md`
- `app/shared/config/runtime-env.server.ts`
- `app/shared/config/app-config.server.ts`
- `app/shared/config/public-env.server.ts`
- `app/modules/runtime/application/production-readiness.policy.ts`
- `tests/integration/shared/runtime-env.server.test.ts`
- `tests/integration/shared/auth-config.server.test.ts`
- `app/modules/runtime/application/production-readiness.policy.test.ts`
- `tests/integration/runtime/production-startup-preflight.test.ts`

## 1. Objective

Runtime configuration must distinguish between an omitted optional setting and a
present but invalid setting.

The final state is:

- omitted optional runtime env values keep their current defaults
- blank optional runtime env values are treated the same as omitted values only
  where that is the existing contract
- present invalid boolean values fail with an error naming the env key
- present invalid positive-integer values fail with an error naming the env key
- numeric strings must be whole base-10 positive integers, with no partial
  parsing such as `10abc` or `1.5`
- `NODE_ENV` must be absent or one of the supported runtime modes
- `NODE_ENV=prod` cannot silently skip production startup/readiness strictness
- error messages must not include secret values

## 2. Problem Statement

The current runtime config boundary still contains permissive parser behavior:

- `readBoolean(value, fallback)` returns the fallback for unknown strings.
- `readPositiveInteger(value, fallback)` uses `Number.parseInt`, so partially
  numeric strings can be accepted.
- invalid or non-positive numeric values often become defaults.
- `loadRuntimeEnv()` sets `isProductionRuntime` with
  `nodeEnv === 'production'`, so a typo such as `NODE_ENV=prod` behaves like a
  non-production runtime.
- `production-readiness.policy.ts` separately checks
  `env.NODE_ENV === 'production'`, so the same typo also skips production
  readiness policy.

That means operator mistakes can change auth throttling, session lifetime,
proxy-trust behavior, media packaging segment duration, and production preflight
without an early error.

## 3. Scope

### 3.1 In Scope

- Harden runtime parser helpers in `app/shared/config/runtime-env.server.ts`.
- Pass env key names into parser errors so failures are actionable.
- Keep existing defaults when optional env values are absent.
- Define and enforce supported `NODE_ENV` values at the config boundary.
- Keep runtime readiness production detection aligned with the same supported
  mode policy.
- Remove the non-production auth client cookie secret fallback and document the
  required `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET` setup.
- Update tests that currently expect invalid values to fall back.
- Add regression tests for partial numeric parsing and production-mode typos.
- Preserve current public env variable names in `PUBLIC_ENV_KEYS`.

### 3.2 Out Of Scope

- Renaming environment variables.
- Adding compatibility aliases for old env names.
- Changing default values.
- Changing required-secret presence policy beyond parser correctness.
- Changing admin API mode validation, except where shared parser behavior
  touches `NODE_ENV`.
- CLI hardening for backfill, seed, or migration commands.
- Playlist, upload, visibility, ingest, playback, or storage behavior unrelated
  to runtime config parsing.
- Browser UI changes.

## 4. Target Runtime Policy

### 4.1 Optional Values

If an optional env value is absent, use the current default.

If an optional env value is present but blank, preserve the current blank-as-
absent behavior for settings that already treat blank as unset. Do not create a
new breaking rule where blank env values are common in tests unless a test proves
the blank value is an operator-provided invalid value that should fail.

### 4.2 Booleans

Accepted boolean strings stay:

- true: `1`, `true`, `yes`, `on`
- false: `0`, `false`, `no`, `off`

Parsing remains trim and case insensitive.

Any other non-blank value must throw. Example invalid values:

- `maybe`
- `enabled`
- `truthy`
- `2`

### 4.3 Positive Integers

Accepted positive integer strings must match a whole base-10 integer and be
greater than zero.

Accepted examples:

- `1`
- `750`
- `604800000`
- ` 10 `

Rejected examples:

- `0`
- `-1`
- `1.5`
- `10abc`
- `abc`
- `Infinity`
- `NaN`

Do not use `parseInt` for accepted parsing. Use a full-string check before
conversion.

### 4.4 Runtime Mode

Supported explicit `NODE_ENV` values:

- `development`
- `test`
- `production`

`NODE_ENV` may remain absent.

Any other non-blank explicit value must fail. Example invalid values:

- `prod`
- `dev`
- `staging`
- `local`

The production readiness policy must use the same interpretation. A typo must
not result in a healthy non-production classification.

## 5. Current Evidence

Parser evidence:

- `app/shared/config/runtime-env.server.ts` returns fallback for unknown boolean
  strings.
- `app/shared/config/runtime-env.server.ts` uses `Number.parseInt`, which allows
  partial numeric parsing.
- `app/shared/config/runtime-env.server.ts` computes `isProductionRuntime` with
  strict equality to the raw string `production`.

Call-site evidence:

- `app/shared/config/app-config.server.ts` uses `readPositiveInteger` for auth
  session TTL, login throttling windows, failed-login delay, max failed-login
  attempts, and media segment duration.
- `app/shared/config/app-config.server.ts` uses `readBoolean` for
  `MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS`.
- `app/modules/runtime/application/production-readiness.policy.ts` repeats
  `env.NODE_ENV === 'production'`.

Test evidence:

- `tests/integration/shared/auth-config.server.test.ts` currently expects
  non-positive and invalid numeric settings to fall back.
- `tests/integration/shared/auth-config.server.test.ts` currently expects
  `MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS=unexpected` to parse as `false`.
- `tests/integration/shared/runtime-env.server.test.ts` currently exercises the
  typed config boundary and media segment duration fallback.
- `app/modules/runtime/application/production-readiness.policy.test.ts` only
  covers `production`, `development`, `test`, and absent runtime mode.

## 6. Implementation Steps

### Step 1: Add Red Tests For Invalid Present Runtime Values

Edit `tests/integration/shared/runtime-env.server.test.ts` and
`tests/integration/shared/auth-config.server.test.ts`.

Add tests that prove:

1. absent optional numeric settings still use defaults
2. blank optional numeric settings keep the current blank-as-default behavior
3. explicit invalid numeric settings throw and name the env key
4. numeric partial strings throw:
   - `MEDIAVAULT_AUTH_SESSION_TTL_MS=10abc`
   - `MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS=1.5`
   - `DASH_SEGMENT_DURATION=6seconds`
5. non-positive numeric strings throw:
   - `0`
   - `-1`
6. valid boolean spellings still parse as before
7. explicit invalid boolean strings throw and name
   `MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS`
8. `NODE_ENV=prod` throws and names `NODE_ENV`

Update the existing fallback tests instead of duplicating contradictory tests.

Acceptance criteria:

- Tests are red before parser changes.
- Tests assert key names, not entire fragile error wording.
- Tests do not assert secret values in error messages.

Suggested focused command:

```bash
bun run test tests/integration/shared/runtime-env.server.test.ts tests/integration/shared/auth-config.server.test.ts
```

### Step 2: Harden Runtime Parser Helpers

Edit `app/shared/config/runtime-env.server.ts`.

Replace generic fallback-only parser helpers with key-aware helpers. Keep the
public helper names only if call-site readability remains good; otherwise add
new helpers and migrate call sites.

Recommended shape:

```ts
readBoolean(input: { key: string; value: string | undefined; fallback: boolean })
readPositiveInteger(input: { key: string; value: string | undefined; fallback: number })
readRuntimeMode(value: string | undefined)
```

Required behavior:

- `undefined` returns fallback for optional boolean/integer settings.
- blank string returns fallback only for optional boolean/integer settings.
- unknown boolean string throws `Invalid <KEY>. Expected true or false.`
- integer parser must reject partial parsing before converting to `number`.
- integer parser must reject values outside `Number.isSafeInteger`.
- integer parser must reject `<= 0`.
- runtime mode parser accepts absent, `development`, `test`, and `production`.
- runtime mode parser rejects unknown non-blank values.

Do not include actual env values in thrown messages.

Acceptance criteria:

- No `Number.parseInt` remains in runtime config parsing.
- Parser failures name the key and not the value.
- Existing default behavior for absent optional settings is preserved.

Suggested focused command:

```bash
bun run test tests/integration/shared/runtime-env.server.test.ts
```

### Step 3: Migrate Config Call Sites To Key-Aware Parsing

Edit `app/shared/config/app-config.server.ts`.

Update each parser call to pass the relevant key from `PUBLIC_ENV_KEYS`:

- `MEDIAVAULT_AUTH_SESSION_TTL_MS`
- `MEDIAVAULT_AUTH_FAILED_LOGIN_BLOCK_DURATION_MS`
- `MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS`
- `MEDIAVAULT_AUTH_FAILED_LOGIN_WINDOW_MS`
- `MEDIAVAULT_AUTH_MAX_FAILED_LOGIN_ATTEMPTS`
- `MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS`
- `DASH_SEGMENT_DURATION`

Preserve existing default constants:

- session TTL: `604_800_000`
- failed-login block duration: `300_000`
- failed-login delay: `750`
- failed-login window: `300_000`
- max failed-login attempts: `5`
- segment duration: `10`
- trust proxy headers: `false`

Acceptance criteria:

- Valid config inputs still produce the same typed config as before.
- Invalid present inputs fail before returning a config object.
- Error messages identify the specific env key.

Suggested focused command:

```bash
bun run test tests/integration/shared/auth-config.server.test.ts tests/integration/shared/runtime-env.server.test.ts
```

### Step 4: Align Production Readiness Runtime Mode Handling

Edit `app/modules/runtime/application/production-readiness.policy.ts`.

Remove the duplicated raw `env.NODE_ENV === 'production'` interpretation. The
policy must use the same runtime-mode rules as `loadRuntimeEnv()` or an extracted
shared parser from `runtime-env.server.ts`.

Add or update tests in
`app/modules/runtime/application/production-readiness.policy.test.ts` so:

- `NODE_ENV=production` is production
- `NODE_ENV=development` is not production
- `NODE_ENV=test` is not production
- absent `NODE_ENV` is not production
- `NODE_ENV=prod` throws or otherwise produces an explicit invalid-runtime-mode
  failure rather than silently returning `false`

Implementation choice:

- Prefer a shared pure helper exported from `app/shared/config/runtime-env.server.ts`.
- Do not make production readiness import a full app config object that would
  require unrelated secrets just to classify the runtime mode.

Acceptance criteria:

- There is one runtime-mode interpretation used by config and readiness policy.
- `NODE_ENV=prod` cannot bypass production readiness.
- Tests document the chosen invalid-mode failure behavior.

Suggested focused command:

```bash
bun run test app/modules/runtime/application/production-readiness.policy.test.ts tests/integration/runtime/production-startup-preflight.test.ts
```

### Step 5: Add Architecture/Regression Guard For Parser Drift

Add a narrow regression test if the implementation leaves easy drift paths.

Preferred options:

1. In `tests/integration/shared/runtime-env.server.test.ts`, assert that runtime
   config rejects the representative invalid inputs for every key listed in
   Step 3.
2. If source scanning is already used nearby, add a small architecture assertion
   that `app/shared/config/runtime-env.server.ts` does not use
   `Number.parseInt`.

Do not add broad source-string checks for every config file unless the behavior
tests are insufficient. Behavior tests are the primary guard.

Acceptance criteria:

- Future parser changes cannot reintroduce partial numeric parsing unnoticed.
- The guard is narrow and does not make unrelated refactors noisy.

Suggested focused command:

```bash
bun run test tests/integration/shared/runtime-env.server.test.ts
```

## 7. Verification Strategy

This is runtime-sensitive configuration work. Per `docs/verification-contract.md`,
final verification must include:

```bash
bun run check:runtime
```

Use focused iteration first:

```bash
bun run test tests/integration/shared/runtime-env.server.test.ts tests/integration/shared/auth-config.server.test.ts
bun run test app/modules/runtime/application/production-readiness.policy.test.ts tests/integration/runtime/production-startup-preflight.test.ts
bun run typecheck
```

Then run the required final gate:

```bash
bun run check:runtime
```

No Playwright MCP/manual browser QA is required unless the implementation
unexpectedly changes browser-visible auth or playback behavior. This plan should
not touch UI code.

## 8. Commit Strategy

One commit is appropriate.

Suggested commit subject:

```text
Harden runtime config parsing
```

Expected files:

- `app/shared/config/runtime-env.server.ts`
- `app/shared/config/app-config.server.ts`
- `app/modules/runtime/application/production-readiness.policy.ts`
- `tests/integration/shared/runtime-env.server.test.ts`
- `tests/integration/shared/auth-config.server.test.ts`
- `app/modules/runtime/application/production-readiness.policy.test.ts`
- possibly `tests/integration/runtime/production-startup-preflight.test.ts`

Do not include unrelated hardening items in this commit. Playlist query parsing,
ffprobe duration handling, CLI argument handling, malformed JSON route handling,
and storage-mutating CLI policy belong in later commits.

## 9. Success Criteria

- Invalid explicit boolean env values fail fast.
- Invalid explicit positive-integer env values fail fast.
- Partial numeric strings fail fast.
- Omitted optional env values still use current defaults.
- Existing accepted boolean spellings still work.
- Existing valid numeric values still work.
- `NODE_ENV=prod` cannot silently skip production readiness.
- Error messages name env keys but do not print secret values.
- `bun run check:runtime` passes, or any pre-existing failures are documented
  with exact failing command output.

## 10. Risks And Guardrails

- Do not accidentally make all blank optional env values fatal if current tests
  and scripts rely on blank-as-absent behavior.
- Do not require production-only secrets in non-production tests merely to
  classify runtime mode.
- Do not broaden this into environment variable renaming.
- Do not weaken production readiness tests to accommodate the new parser.
- Do not use `as any`, `@ts-ignore`, or `@ts-expect-error` to force type
  compatibility.
- Do not log secret values from parser errors.
