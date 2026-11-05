# Repository Guidelines

## Runtime and package management

Mediavault is a single-deployment React Router Framework application. The maintainer approved replacing the former Bun-only toolchain with Node.js LTS and pnpm. Use pnpm for repository dependency management and scripts; do not introduce competing lockfiles. The exact supported versions belong in the package/runtime configuration. Keep development, verification, CI, and Docker aligned with that contract.

## Architecture and ownership

- Keep URL adapters, loaders, and actions in `app/routes/`; they authenticate, validate input, call application code, and translate HTTP responses. Do not assemble database or media-tool dependencies in routes.
- `app/composition/server/` owns explicit dependency assembly and cross-module adapters, not duplicated business logic or a generic dependency-injection framework.
- Backend features live in `app/modules/`. Business modules use `domain`, `application/use-cases`, `application/ports`, and `infrastructure` where those boundaries provide real value. Technical modules need only the layers they actually use. Do not create empty layers, command/query buses, or speculative interfaces.
- Prefer page-owned UI, hooks, and state under `app/pages/<page>/`. Keep single-page code together without making giant components. Extract shared features, entity view models, and widgets only for a focused responsibility or actual reuse.
- `app/shared/ui/` is the canonical generated shadcn primitive layer. Do not hand-edit primitive internals unless explicitly requested. Fix page-level semantics and layout in the usage layer; generate or update primitives through shadcn.
- Raw `radix-ui` and `@radix-ui/*` imports belong only in the primitive layer. Other UI consumes `~/shared/ui/*`.
- Use `~/*` for internal imports. Keep database, filesystem, process execution, and secrets out of browser imports. Make server-only boundaries explicit.
- Keep authorization policies centralized. Public video access and authenticated ownership are separate concepts; do not restore the obsolete all-pages-private or config-owned-user model.

## Compatibility and modernization

The maintainer confirmed there are no deployed users, data, or legacy consumers to preserve. Remove obsolete data-migration and compatibility scaffolding instead of maintaining parallel namespaces or old/new implementations. Test the intended fresh-install model. This does not authorize deleting the developer's actual local files as a testing shortcut.

Consequential architecture changes, ambiguous security/product policies, and changes with substantial reversal cost require an explicit contextual question with a recommended option. Routine reversible choices should follow researched official guidance and established ecosystem conventions. Do not treat existing vulnerabilities, placeholders, or TODO buttons as approved behavior to preserve or complete silently.

## Verification

`package.json` and `docs/verification-contract.md` define supported commands and gates. The base completion authority is `pnpm check`; `pnpm check:fast` is for iteration only. Runtime-sensitive changes require the runtime escalation bundle, storage-sensitive changes require data-integrity verification, and browser-visible/runtime-sensitive work requires isolated browser QA.

- Keep module tests close to their implementation; integration, UI, runtime smoke, and browser tests remain distinct test layers.
- Prefer React Testing Library, jest-dom, and user-event for UI behavior, not string-based markup or tests that merely freeze historical file paths.
- Preserve the coverage floor, regression gate, and changed-file validation unless the maintainer explicitly approves a verification-policy change. Never weaken a gate to hide a regression or update a baseline automatically.
- Tests and QA must not depend on the real `.env`, ignored local storage, existing browser state, or untracked media. Use explicit isolated fixture workspaces and test-owned assets.
- Browser QA must observe actual login, navigation, upload/management outcomes, and video playback when relevant, not just successful HTTP responses or a mounted player.
- Run required gates before handoff and report precisely what ran, passed, failed, or remains unverified. Do not claim performance targets without measurement.

## Security and code quality

Use strict TypeScript and avoid `any` in new code. Follow the existing two-space/ESLint formatting conventions. Keep routes thin, validate untrusted input, and inject meaningful I/O dependencies. Never log passwords, bearer tokens, cookies, encryption keys, or their values in QA artifacts. Preserve DASH/ClearKey media authorization and AES-encrypted asset handling unless an explicit approved decision changes them. Consult the current [playback contract](docs/playback.md) before changing playback.

## Deliverables, language, and Git

- Code, comments, permanent documentation, and UI copy are in English; owner-facing communication is in Korean.
- Commit candidates are product code, tests, lockfiles, build/deployment configuration, and useful long-lived documentation.
- Research reports, feature inventories, decision logs, task tracking, scratch code, raw logs, and QA screenshots belong outside the repository. Do not add temporary execution reports under `docs/plans/` or stage ignored runtime artifacts.
- Protect `main`: work on a task branch, never commit refactoring directly to `main`, and preserve unrelated changes and stashes.
- Do not create commits without explicit authorization. For authorized commits, load and follow the `commit` skill, including its convention reference and commit guard; never run `git commit` directly.
- Do not push a branch or create a pull request without explicit user permission for that action.
- If asked to commit, use the repository's gitmoji plus capitalized imperative convention and keep subjects under 72 characters.
