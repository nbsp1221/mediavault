# Mediavault UI/UX Agent Audit

Status: Consolidated audit report
Date: 2026-05-29
Scope: Home browsing, watching, upload, edit, delete, visibility management, playlist-adjacent navigation, and accessibility.

## 1. Executive Summary

This audit ran five independent review lenses:

- Nielsen heuristic review
- cognitive walkthrough
- WCAG/accessibility review
- UI/backend wiring audit
- industry benchmark review against video-service patterns

The strongest conclusion is that Mediavault's product direction is correct: it should stay a restrained personal video vault, not become YouTube Studio or Netflix. The main defects are not visual taste issues. They are discoverability, state confidence, dead/misleading surfaces, and accessibility gaps around the workflows the product already supports.

The prior UI/UX report was directionally correct, but it underweighted two classes of problems:

- Accessibility defects in upload, player, small interactive targets, and unnamed controls.
- Wiring drift around playlists, settings, and inert controls that can make the UI feel less trustworthy even outside the core video workflow.

No single agent's output was accepted blindly. The final severity below uses this rule:

- `P0`: blocks a primary user journey or presents a materially false mental model.
- `P1`: likely to cause repeated task failure, privacy uncertainty, or trust loss.
- `P2`: meaningful friction, but the main task can still usually succeed.
- `P3`: polish or future scaling issue.

## 2. Evidence Base

Project evidence:

- Existing review and screenshots: `docs/plans/2026-05-29-mediavault-ui-ux-review.md`
- Anonymous home screenshot: `docs/plans/2026-05-29-mediavault-ui-ux-review-assets/mediavault-home-anonymous.png`
- Owner home screenshot: `docs/plans/2026-05-29-mediavault-ui-ux-review-assets/mediavault-home-owner.png`
- Owner Quick View screenshot: `docs/plans/2026-05-29-mediavault-ui-ux-review-assets/mediavault-quick-view-owner.png`
- Upload empty screenshot: `docs/plans/2026-05-29-mediavault-ui-ux-review-assets/mediavault-add-videos-empty.png`
- Player screenshots: `docs/plans/2026-05-29-mediavault-ui-ux-review-assets/mediavault-player-desktop.png`, `docs/plans/2026-05-29-mediavault-ui-ux-review-assets/mediavault-player-mobile.png`

External references:

- getdesign.md DESIGN.md collection: https://getdesign.md/
- getdesign.md Runway analysis: https://getdesign.md/runwayml/design-md
- getdesign.md Spotify analysis: https://getdesign.md/spotify/design-md
- getdesign.md PlayStation analysis: https://getdesign.md/playstation/design-md
- NN/g 10 usability heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- NN/g heuristic evaluation method and limits: https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/
- NN/g severity rating factors: https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/
- YouTube upload workflow and visibility selection: https://support.google.com/youtube/answer/57407?hl=en
- YouTube video privacy settings: https://support.google.com/youtube/answer/157177?hl=en-CA&ref_topic=9257440
- Netflix search and browse model: https://help.netflix.com/en/node/47765
- Netflix TV experience update: https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

## 3. Final Findings

### P0-1: Anonymous Users Cannot Discover Sign-In

Anonymous users can browse public videos, but there is no visible sign-in or owner-mode entry point. The login route exists, but the user must know or guess `/login`.

Why this is not preference:

- It violates NN/g recognition over recall: the action exists but is not visible.
- It blocks the owner-transition task in the cognitive walkthrough.
- It is inconsistent with common account-based video services, which allow public browsing while preserving an explicit account entry point.

Project evidence:

- `HomeAccountMenu` returns `null` for anonymous users: `app/features/home-account-menu/ui/HomeAccountMenu.tsx`
- Owner-only upload/account controls are only rendered when `showOwnerNavigation` is true: `app/widgets/home-shell/ui/HomeShell.tsx`
- Anonymous screenshot shows no sign-in affordance: `mediavault-home-anonymous.png`

Recommended correction:

- Add a visible `Sign in` action to anonymous desktop and mobile headers.
- Add the same account transition to the mobile/sidebar account area.
- Preserve public browsing without showing owner-only upload/manage actions.

### P0-2: Navigation Surfaces Imply Features That Are Not Actually Available

Several UI surfaces suggest functionality that does not match route/backend behavior:

- `Playlists` is visible in anonymous navigation, but `/playlists` requires a protected session.
- `Settings` links to `/settings`, but no matching route exists.
- Playlist detail buttons log TODO messages for play/edit actions.
- Playlist detail copy says videos can be added to a playlist from library cards, but library cards only expose Quick View.
- The upload shell shows a bell icon that has no accessible name or behavior.

Why this is not preference:

- It violates consistency and standards, match with the real world, and error prevention.
- It creates trust loss because controls look operational but cannot complete the implied task.
- It is a UI/backend contract problem, not an aesthetic issue.

Project evidence:

- `HOME_LIBRARY_ITEMS` includes `/playlists`: `app/entities/home-shell/model/home-navigation.ts`
- `/playlists` calls `requireProtectedPageSession`: `app/routes/playlists._index.tsx`
- settings nav points to `/settings`: `app/entities/home-shell/model/home-navigation.ts`
- playlist handlers log TODOs: `app/widgets/playlist-detail-view/model/usePlaylistDetailView.ts`
- playlist copy claims card-to-playlist sending: `app/widgets/playlist-detail-view/ui/PlaylistInfoPanel.tsx`
- upload header bell has no action/label: `app/widgets/add-videos-shell/ui/AddVideosShell.tsx`

Recommended correction:

- Hide anonymous playlist navigation unless a public playlist route is implemented.
- Remove or implement `/settings`.
- Remove inert playlist actions until wired, or implement the missing flows.
- Remove the upload bell or give it a real notification surface and accessible name.

### P1-1: Anonymous Home Uses The Wrong Mental Model

The anonymous home page says `My Library`, even though anonymous users are viewing public videos, not their own library.

Why this is not preference:

- It violates match between the system and the real world.
- It weakens the public/private model by implying ownership where none exists.
- It combines with missing sign-in to make the current user mode ambiguous.

Project evidence:

- Static heading in `HomeLibraryWidget`: `app/widgets/home-library/ui/HomeLibraryWidget.tsx`
- Anonymous screenshot shows `My Library`: `mediavault-home-anonymous.png`

Recommended correction:

- Anonymous heading: `Public Videos` or `Mediavault`
- Anonymous count: `Showing N public videos`
- Owner heading can remain `My Library`

### P1-2: Owner Management Is Hidden Behind Hover And Quick View

Edit, delete, and visibility management are all available, but the entry point is weak. Card actions are hidden until hover/focus, and Quick View then contains the actual management controls.

Why this is not preference:

- It violates recognition over recall.
- It disproportionately affects touch/mobile users because hover is unavailable.
- Cognitive walkthrough found this same failure point for edit, delete, and visibility tasks.

Project evidence:

- Card action wrapper starts at `opacity-0`: `app/entities/library-video/ui/LibraryVideoCard.tsx`
- Quick View is the gateway to edit/delete/visibility: `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx`
- Mobile owner screenshot shows no obvious management affordance: `mediavault-home-mobile-owner.png`

Recommended correction:

- For owned videos, expose a persistent `Manage` affordance or always-visible action trigger.
- Keep anonymous/read-only cards cleaner.
- Do not expose destructive actions directly on cards; keep delete behind confirmation.

### P1-3: Quick View Hides Critical Owner State Below The Fold

Quick View starts with title, small edit action, a large media preview, description, tags, metadata, then visibility and owner actions. In the captured viewport, visibility and bottom actions are not immediately visible.

Why this is not preference:

- Public/private is a sensitive security state and should be visible near the decision point.
- The large preview makes the dialog feel read-only even though it is the main owner management surface.
- Accessibility review flagged reflow/focus-order risk at common viewport heights.

Project evidence:

- Quick View screenshot shows only preview and description above the fold: `mediavault-quick-view-owner.png`
- Visibility block appears later in `HomeQuickViewDialog`: `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx`

Recommended correction:

- Move `Visibility`, `Edit Info`, and `Delete` into a stable owner-management area near the top.
- Reduce preview height or use a desktop two-column layout.
- Keep the publish confirmation flow.

### P1-4: Upload Does Not Communicate Privacy At The Commit Point

New uploads are saved as private, which is the right policy, but the upload review screen does not say this before the user adds the video to the library.

Why this is not preference:

- Visibility is a core product state after the public/private milestone.
- YouTube treats visibility as an explicit upload/publish concept; Mediavault can be simpler, but it still needs explicit state.
- This is error prevention: users should know whether upload equals publication.

Project evidence:

- Commit use case writes `visibility: 'private'`: `app/modules/ingest/application/use-cases/commit-staged-upload-to-library.usecase.ts`
- Upload review UI has file, progress, metadata, and `Add to Library`, but no visibility copy: `app/widgets/add-videos/ui/AddVideosView.tsx`

Recommended correction:

- Add `Visibility: Private` to the review card.
- Add helper copy: `New uploads are private until you make them public from Quick View.`
- Do not add a publish selector until the product explicitly wants upload-time publishing.

### P1-5: Upload Completion Breaks The Verification Loop

After a successful commit, the main action is `Upload Another Video`. The commit response includes `videoId`, but the UI does not preserve it to open the new video or show it in the library.

Why this is not preference:

- After upload, the natural next task is to verify playback and metadata.
- This violates user control and efficiency.
- It weakens confidence because the user must manually navigate back and find the created item.

Project evidence:

- Commit success response is parsed, but `videoId` is not stored in completed session state: `app/widgets/add-videos/model/useAddVideosView.ts`
- Completed UI shows only `Upload Another Video`: `app/widgets/add-videos/ui/AddVideosView.tsx`

Recommended correction:

- Store `videoId` after commit.
- Add primary `Open Video` and secondary `View in Library`.
- Keep `Upload Another Video` as a secondary action.

### P1-6: Upload And Player State Changes Are Not Accessible Enough

The upload progress UI is visually understandable, but it lacks progressbar semantics and live status announcements. Player loading/error states also rely on visual text without status/alert semantics.

Why this is not preference:

- WCAG 2.2 and ARIA expectations require programmatic state communication where status changes matter.
- Upload and secure playback are asynchronous workflows; silent state changes make assistive technology users uncertain.

Project evidence:

- Upload progress is a div width change plus text: `app/widgets/add-videos/ui/AddVideosView.tsx`
- Player loading shell has spinner/text without live status semantics: `app/widgets/player-surface/ui/PlayerSurface.tsx`
- Player error block lacks alert semantics: `app/widgets/player-surface/ui/PlayerSurface.tsx`

Recommended correction:

- Use `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`.
- Use `role="status"`/`aria-live="polite"` for upload and playback loading.
- Use `role="alert"` for playback and upload errors.

### P1-7: Upload Shell Has Accessible-Name And Inert-Control Problems

The upload page shell includes a search input with no effective workflow on the upload page and a bell icon button with no accessible name or behavior.

Why this is not preference:

- Unnamed controls violate accessible name requirements.
- Controls that do not do anything increase uncertainty and reduce trust.
- This is especially visible because the upload page is already a high-focus task surface.

Project evidence:

- Upload shell search input and bell icon: `app/widgets/add-videos-shell/ui/AddVideosShell.tsx`
- Upload page does not pass a meaningful search workflow: `app/pages/add-videos/ui/AddVideosPage.tsx`

Recommended correction:

- Remove upload-page search unless it navigates/searches the library.
- Remove the bell until notifications exist, or add a named, wired notification menu.

### P2-1: Edit And Delete Lack Strong Success Feedback

Edit save closes edit mode. Delete closes the modal and removes the card. Both can work, but the user must infer completion from UI changes.

Why this is not just preference:

- State-change feedback is a core heuristic.
- The issue is not catastrophic because the visible list updates, but repeated management workflows benefit from explicit confirmation.

Project evidence:

- Edit form returns to view mode after save: `app/features/home-quick-view/ui/EditHomeVideoForm.tsx`, `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx`
- Delete removes the item through `useHomeLibraryView`: `app/widgets/home-library/model/useHomeLibraryView.ts`

Recommended correction:

- Add a small success status after edit/delete.
- Make the message screen-reader visible via `role="status"`.

### P2-2: Interactive Target Sizes Are Uneven

Several small controls are below or near WCAG 2.2 target-size expectations, especially tag chips and remove controls.

Why this is not just preference:

- Small targets are a measurable accessibility and mobile usability issue.
- The problem is local and fixable without changing the product model.

Project evidence:

- Tag buttons on cards: `app/entities/library-video/ui/LibraryVideoCard.tsx`
- Tag remove buttons: `app/features/video-metadata/ui/VideoTagInput.tsx`
- Taxonomy remove controls: `app/features/video-metadata/ui/VideoTaxonomyCombobox.tsx`

Recommended correction:

- Normalize interactive chip targets to at least 24px in height and width.
- Verify with a Playwright bounding-box audit.

### P2-3: Player Return Loses Prior Context

The player `Library` link always returns to `/`, so prior search/filter context can be lost.

Why this is not just preference:

- It affects user control and efficiency.
- It becomes more important as the library grows.

Project evidence:

- Player back link is fixed to `/`: `app/widgets/player-surface/ui/PlayerSurface.tsx`

Recommended correction:

- Preserve origin query state when entering the player.
- If that is too much for now, keep this as a lower-priority navigation improvement.

### P2-4: Search/Filter Supports The Basics But Lacks Management-Useful Sorting

The home surface has search and filters, but no basic sort or owner quick filters.

Why this is not just preference:

- Netflix-style recommendation rows are not necessary, but personal libraries still need efficient retrieval.
- Owner workflows benefit from `Recently added`, `Title`, `Duration`, `Private`, and `Public`.

Project evidence:

- Current home exposes search and filters, but no sort control in the captured home UI.
- Existing screenshots show a small library; this is a scaling risk more than an immediate blocker.

Recommended correction:

- Add a compact `Sort` control before recommendation-style features.
- Add owner-only quick filters for `All`, `Private`, and `Public`.

### P2-5: Mediavault Lacks A Written Product Design Contract

The getdesign.md approach shows why many AI-generated UIs feel closer to commercial products: the model is not asked to improvise taste. It is given a `DESIGN.md` contract with explicit color roles, type scale, component grammar, spacing, layout principles, elevation rules, responsive behavior, and do/don't rules.

Mediavault has a working dark UI, but it does not yet have this kind of product-specific visual contract. The result is not catastrophic, but it explains several rough edges:

- Home and upload use similar chrome, but the upload shell carries search and notification controls that are not meaningful to the upload task.
- Buttons mix pill, rounded, icon, and text-heavy treatments without a clearly documented action hierarchy.
- The UI is dark and media-oriented, but it does not clearly decide whether it is a dense Spotify-like media library, a cinematic Runway-like media tool, or a quiet utility vault.
- The owner management model is not encoded as a component grammar. For example, there is no documented rule like "owned videos always expose a persistent manage affordance."

Why this is not just preference:

- Commercial design systems reduce ambiguity by making repeated decisions explicit.
- Without a written design contract, each new feature can add locally reasonable UI that weakens the whole product language.
- This is already visible in shell duplication, inert controls, and hidden owner affordances.

Recommended correction:

- Add a project-local `DESIGN.md` or `docs/design/mediavault-design.md`.
- Define Mediavault's own visual target, not a direct clone: "dark personal video vault, content-first, privacy-confident, owner-management discoverable."
- Include concrete rules for color roles, typography, buttons, cards, dialogs, upload states, owner actions, privacy states, empty states, responsive behavior, and accessibility.
- Use getdesign.md files only as references. Spotify is useful for dense dark media-library grammar; Runway is useful for cinematic media preview discipline; PlayStation is useful for restrained premium surfaces and clear full-bleed content hierarchy.

## 4. Findings Rejected Or Downgraded

No P0 was assigned for "the entire product is unusable." The app can browse, watch, upload, edit, delete, and change visibility after authentication.

The following differences from major video platforms are not problems by themselves:

- No channels, comments, likes, subscribers, creator analytics, or monetization.
- No Netflix-style hero, autoplay trailers, Top 10, or algorithmic rows.
- No public badge on every public video. Showing only `Private` is appropriate because private is the exceptional security-sensitive state.
- Single-video upload only. This is acceptable for the current staged-review workflow.
- No typed-delete confirmation. Current delete confirmation is probably enough for a personal vault, though success feedback should improve.

## 5. Recommended Execution Order

1. Fix anonymous mode: add `Sign in`; change anonymous heading/count copy; hide or correct anonymous playlist navigation.
2. Remove misleading controls: `/settings` nav, inert playlist actions, upload bell/search unless they are wired.
3. Add upload privacy confidence: `Visibility: Private`, upload progress semantics, post-commit `Open Video`.
4. Make owner management discoverable: persistent owner-card manage affordance and higher Quick View management section.
5. Add accessibility hardening: progressbar/live regions, player status/alert roles, target-size fixes, cleaner card link names.
6. Add workflow feedback: edit/delete success states.
7. Add retrieval scaling: sort and owner quick filters.
8. Create a Mediavault design contract before broad visual redesign, so future UI changes are judged against a stable product language rather than taste.

## 6. Verification Needed After Fixes

Minimum focused checks:

- Anonymous home: `Sign in` visible and keyboard reachable on desktop/mobile.
- Owner home mobile: manage action discoverable without hover.
- Upload selected/ready state: `Visibility: Private` visible before `Add to Library`.
- Upload progress: accessibility tree exposes progressbar and status.
- Upload completed state: `Open Video` works from returned `videoId`.
- Quick View at 768px height and mobile: visibility/edit/delete are reachable and not visually hidden below an ambiguous fold.
- Playlist/settings navigation: no inert or protected-looking-public navigation remains.

Full project handoff would still require the normal verification gate after implementation:

- `bun run check`
- relevant browser smoke from `docs/E2E_TESTING_GUIDE.md`
