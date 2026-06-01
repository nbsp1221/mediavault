# Prototype-Aligned UI Detail Redesign Subagent Review Synthesis

Status: Complete
Date: 2026-06-01
Owner: Codex orchestration pass

Reviewed artifacts:

- `docs/plans/2026-06-01-prototype-aligned-ui-detail-redesign/prototype-analysis-report.md`
- `docs/plans/2026-06-01-prototype-aligned-ui-detail-redesign/shadcn-fsd-application-strategy.md`
- `docs/plans/2026-06-01-prototype-aligned-ui-detail-redesign/implementation-plan.md`

## Reviewers

### UI/Design Analysis Reviewer

Scope:

- Compare `prototype.png`, `mediavault_ui.html`, `DESIGN.md`, and current
  product shell/video details implementation.
- Identify prototype decisions that should be extracted before implementation.

Key findings:

- Treat the prototypes as an information hierarchy and density reference, not a
  literal CSS source.
- The target desktop detail page is a media-first 7/5 composition, while current
  code uses a form-heavier `0.9fr/1.1fr` grid.
- Current metadata form grouping does not match Basic information vs
  Classification.
- Save/cancel currently live inside the feature form but should visually become
  route-level header actions.
- Mobile detail header needs an explicit back/title/save contract.
- Current surface hierarchy is inconsistent across plain sections, separators,
  and muted bordered panels.

Actions reflected in documents:

- Added media-first grid and 12-column/7-5 layout guidance.
- Added Basic information, Classification, Visibility, Danger zone panel order.
- Added route-header action and mobile-header contract decisions.
- Added explicit token translation requirement for prototype raw values.
- Added account/sidebar-footer and mobile-header questions as open questions.

### shadcn/FSD Strategy Reviewer

Scope:

- Verify the proposed method against shadcn project configuration and FSD
  boundaries.
- Identify component composition and anti-pattern risks.

Key findings:

- Current project is React Router, Tailwind v4, shadcn `new-york`, Radix base,
  Lucide icons, and semantic CSS variables.
- Prototype details should be absorbed through `app/app.css` tokens,
  `app/shared/ui` primitives, and FSD slice composition.
- Do not put domain components such as `VisibilityPanel` or `DangerZone` in
  `app/shared/ui`.
- Prefer `Alert` over repeated custom error boxes.
- Use `Badge` for status labels.
- Use `data-icon` button icon conventions and avoid expanding manual icon
  sizing.
- Avoid adding new `space-y-*`; prefer `flex flex-col gap-*` for new stacks.
- The installed `Card` primitive has no `size` prop.

Actions reflected in documents:

- Added installed shadcn context and component list.
- Corrected card compactness guidance to avoid non-existent `size` prop.
- Added `Alert`, `Badge`, `data-icon`, and `gap-*` guidance.
- Added explicit FSD ownership map.
- Added anti-pattern list for raw colors, custom alert boxes, domain shared UI,
  and generated primitive edits.

### Testing/Verification Reviewer

Scope:

- Review existing product shell/video-details tests and recommend non-brittle
  verification for the visual detail pass.

Key findings:

- Existing shell tests already cover navigation visibility, active route, drawer,
  coming-soon feedback, and shell exceptions.
- Existing video details tests already cover unsaved guard through several shell
  navigation paths.
- Add IA exclusion tests so prototype-only entries do not leak into product nav.
- Add mobile drawer close behavior coverage.
- Add static architecture guards against reintroducing old shell imports or
  shelling login/player routes.
- Browser QA should use locator/layout contracts, not pixel snapshots.
- Check responsive overflow and touch target bounds across 320, 375, 768, 1024,
  and 1280 px.

Actions reflected in documents:

- Added static architecture guard tests.
- Added IA exclusion test scenarios for `Collections`, `Recently Added`,
  `Import`, `Trash`, `Devices`, `Security`, and fake storage usage.
- Added drawer close/link behavior tests.
- Added E2E/browser QA viewport matrix.
- Kept exact visual pixel assertions out of the automated test plan.

## Synthesis Decision

The methodology is approved with one important constraint:

Do not implement prototype styling directly. Implement the extracted design
decisions through shadcn semantic tokens, installed primitives, Tailwind layout
utilities, and FSD-owned widget/feature composition.

## Remaining Human Decisions

No unresolved reviewer questions remain.

Resolved decision:

- Adopt Tailwind/shadcn `violet` as the product primary accent for this task.
  `primary` and `sidebar-primary` should move to a violet-600-like accent with
  near-white foregrounds. `secondary`, `muted`, `accent`, and `sidebar-accent`
  remain neutral surface roles.
- Keep desktop account controls in the header for this task. The prototype's
  sidebar footer account/storage area is treated as an example, not a product
  requirement. Do not add fake storage content for visual parity.
- For focused video details/edit mobile headers, suppress the generic account
  action and prioritize `back + title + save`. This is route-specific and must
  not remove account access from other mobile shell-backed routes.
- Use official shadcn `AlertDialog` for video details delete and public
  visibility confirmations. The component is available through
  `bunx --bun shadcn@latest add alert-dialog` and is documented by shadcn as a
  modal dialog for important content that expects a response.
- Do not decide detailed edit-page preview/player controls in this task. That is
  a separate video details/edit page planning concern. Avoid fake decorative
  controls.
