# Repository Guidelines

## Project Structure & Module Organization
The React Router app lives in `app/` and follows feature-sliced design: `pages/` expose route shells, `widgets/` bundle UI compositions, `features/` handle workflow logic, `entities/` shape domain models, and shared helpers belong in `shared/`. For new frontend work, reusable primitives live in `app/shared/ui`, shared UI helpers live in `app/shared/lib`, and feature-specific UI stays inside its owning slice. Compatibility behavior must have an active owner in the current module or composition structure; do not revive migration scaffolds as a parallel namespace. Treat `app/shared/ui/*` as generated shadcn source: do not hand-edit primitive internals unless the maintainer explicitly requests it; prefer regenerating via shadcn CLI, version updates, or fixing semantics in the usage layer. Use the `~/*` alias from `tsconfig.json` for internal imports. Static assets stay in `public/`, runtime data in `storage/`, generated bundles in `build/`, and command scripts in `scripts/`. Architectural notes and investigations reside in `docs/`. Vitest coverage is split between colocated module tests under `app/modules/**/*.{test,spec}.ts` and the broader `tests/` tree for integration, UI, smoke, and E2E coverage.

## Build, Test, and Development Commands
Install once with `bun install` (other package managers are unsupported). Use `bun run dev` to serve the app at `http://localhost:5173`. Local auth setup creates accounts through the operator-only admin API: set `MEDIAVAULT_DATABASE_ENCRYPTION_KEY`, `MEDIAVAULT_ADMIN_API_MODE=bootstrap`, `MEDIAVAULT_ADMIN_API_TOKEN`, and `MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET`, start the server, then call `POST /api/admin/users` with `Authorization: Bearer <token>`. Before any PR, run the required base verification authority: `bun run check`; it expands to `bun run check:hermetic-inputs`, `bun run design:lint`, `bun run lint`, `bun run typecheck`, `bun run test:coverage`, `bun run test:mutation:changed`, and `bun run test:runtime:smoke`. Use `bun run check:fast` only for quick iteration; it is not sufficient for completion or handoff. Use `bun run lint:fix` as an optional local fixer when you want automatic lint rewrites before rerunning `bun run lint`. `bun run test` is the canonical non-watch Vitest entrypoint and does not include smoke tests. The default `bun run test*` verification commands are env-scrubbed by design: Bun `.env` autoloading is disabled and Vite env-file loading is disabled for the test-facing entrypoints, so they must not depend on an ambient local `.env`. `bun run test:coverage` is the calibrated coverage gate: it runs `bun run test:coverage:collect` to generate Vitest coverage and enforce the native 80% floor, then runs `bun run test:coverage:regression` to compare `coverage/coverage-regression-baseline.json` against `tests/coverage-regression-baseline.json` with a 0.25 percentage-point tolerance. Use `bun run test:coverage:update-baseline` only for explicit, reviewable baseline ratchets after coverage improves; `bun run check` must not mutate the baseline. `bun run download:ffmpeg` and `bun run download:shaka` fetch media tooling, and `bun run start` exercises the built server for manual smoke checks.

## Coding Style & Naming Conventions
TypeScript operates in strict mode, so prefer explicit interfaces and avoid `any`. Match the prevailing two-space indentation and split multiline JSX props per the Stylistic ESLint rules. Components, hooks, and providers use PascalCase; helpers and state setters use camelCase; file names mirror their primary export. New reusable UI primitives must be generated or maintained through shadcn in `app/shared/ui`; do not hand-roll repeated primitive controls in page/widget files, do not create parallel primitive layers, and do not patch shadcn-generated primitive files to solve page-level semantics or layout concerns.

## Testing Guidelines
Vitest drives unit and integration coverage. Name files `*.test.ts`, keep arrange/act/assert sections clear, and use `bun run test:coverage` for the calibrated coverage gate. Use `bun run test:coverage:collect` only when you need to regenerate Vitest coverage output before a focused regression check. Use `bun run test`, `bun run test:modules`, `bun run test:integration`, and `bun run test:ui-dom` for focused Vitest work; use `bun run vitest:ui` only as a developer UI launcher, not as verification. Prefer `jsdom + React Testing Library + jest-dom + user-event` for new component-level UI tests instead of string-based markup assertions. Use `bun run check` before handoff so the runtime smoke layer runs too. For end-to-end work, follow `docs/E2E_TESTING_GUIDE.md`: use `bun run test:e2e:smoke` for the required hermetic browser path, use HTTP checks first where they are sufficient, and start `bun run dev` only for optional manual QA or local investigation.

Treat `docs/verification-contract.md` as the source of truth for required verification and escalation rules.
Treat `docs/browser-qa-contract.md` as the source of truth for when Playwright MCP or equivalent isolated browser QA is required.
Use `docs/E2E_TESTING_GUIDE.md` for the practical workflow and test-layer guidance.

High-signal summary:
- always run the base verification bundle before handoff
- add `bun run check:runtime` for runtime-sensitive auth, playback, route wiring, or storage changes
- add the required browser smoke and escalate to Playwright MCP or equivalent isolated browser QA when the change is browser-visible and runtime-sensitive
- keep tests environment-independent and free from hidden local-state coupling per the verification contract

## Commit & Pull Request Guidelines
Commits follow the gitmoji + capitalized imperative subject pattern visible in history (e.g., `♻️ Refactor home library view`). Keep subjects under 72 characters, group related work, and avoid force-pushing shared branches. PRs should describe the problem, summarize changes in bullets, list verification steps (lint/test/typecheck/build or Playwright runs), and attach screenshots or clips for UI updates. Link issues or follow-up tasks when available.

## Agent-Specific Notes
Documentation and code comments stay in English, while progress reports to the project owner are delivered in Korean. Maintain Clean Architecture boundaries by routing business logic through `app/modules/` or dedicated hooks and keeping routes thin. For frontend work, prefer shadcn-driven primitives from `~/shared/ui/*`; raw `radix-ui` or `@radix-ui/*` imports belong only inside that primitive layer. Consult `docs/clearkey-investigation.md` before modifying playback flows.

## Architecture Doc Entry Points
Use the docs in this order when you need current architecture or project-state context:

1. `docs/roadmap/current-refactor-status.md` for the current state and next recommended work.
2. `docs/roadmap/personal-video-vault-rearchitecture-phases.md` for phase definitions and per-phase status.
3. `docs/architecture/personal-video-vault-target-architecture.md` for the stable north-star architecture only.
4. explicitly topic-specific notes in `docs/`, such as `docs/clearkey-investigation.md` or `docs/browser-qa-contract.md`. Do not treat archived root docs marked as historical as current guidance.
5. `docs/plans/*` when present for temporary execution plans. If that directory is empty, fall back to explicitly marked root `docs/*.md` execution notes and treat them as working notes, not the source of truth for current repo state.
