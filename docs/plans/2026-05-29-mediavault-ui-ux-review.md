# Mediavault UI/UX Review

Status: Review report
Date: 2026-05-29
Scope: Home browsing, watching, upload, edit, delete, and visibility-management UX.

## 1. Executive Summary

Mediavault's current UI is directionally solid for a personal video vault: it is compact, quiet, security-aware, and avoids the social-platform feel that the product explicitly does not want. The main flows are present:

- anonymous users can browse and watch public videos
- owners can browse public plus owned private videos
- owners can upload one video, review metadata, and add it to the library
- owners can edit metadata, delete videos, and change public/private visibility through Quick View
- the player is content-first and uses familiar playback controls

The highest-impact UX gap is not missing domain functionality. It is workflow discoverability and confidence. A user can complete the owner tasks after login, but several important states and next actions are easy to miss: anonymous users do not have an obvious sign-in entry point, owner-only actions are hidden behind hover menus, visibility controls can sit below the Quick View fold, upload completion does not strongly route the user to the new video, and the anonymous public home still says `My Library`, which is conceptually wrong for visitors.

Recommended product direction: keep the current restrained personal-vault style. Do not copy Netflix's entertainment-heavy recommendation UI or YouTube's creator-platform complexity. Borrow only the proven interaction patterns: clear browsing entry points, visible search/filter affordances, strong progress/status feedback, explicit privacy language, and direct next actions after upload or management changes.

## 2. Method

Reviewed local code and tests for:

- `app/widgets/home-library/*`
- `app/entities/library-video/ui/LibraryVideoCard.tsx`
- `app/features/home-quick-view/ui/HomeQuickViewDialog.tsx`
- `app/widgets/add-videos/*`
- `app/widgets/player-surface/*`
- E2E tests for home, upload, player, and anonymous public access

Ran a local hermetic fixture session and captured:

- [Anonymous home](./2026-05-29-mediavault-ui-ux-review-assets/mediavault-home-anonymous.png)
- [Owner home](./2026-05-29-mediavault-ui-ux-review-assets/mediavault-home-owner.png)
- [Owner Quick View](./2026-05-29-mediavault-ui-ux-review-assets/mediavault-quick-view-owner.png)
- [Upload empty state](./2026-05-29-mediavault-ui-ux-review-assets/mediavault-add-videos-empty.png)
- [Player desktop](./2026-05-29-mediavault-ui-ux-review-assets/mediavault-player-desktop.png)
- [Owner home mobile](./2026-05-29-mediavault-ui-ux-review-assets/mediavault-home-mobile-owner.png)
- [Player mobile](./2026-05-29-mediavault-ui-ux-review-assets/mediavault-player-mobile.png)

External comparison references:

- NN/g's usability heuristics: visibility of system status, user control, consistency, recognition over recall, error prevention, and error recovery. Source: https://www.nngroup.com/articles/ten-usability-heuristics/
- YouTube privacy and upload model: visibility is managed explicitly, and private/public/unlisted behavior is explained in user-facing terms. Sources: https://support.google.com/youtube/answer/157177 and https://help.youtube.com/support/youtube/bin/answer.py?answer=91450
- Netflix discovery model: search, browse rows, shortcuts, and front-and-center metadata reduce the effort of finding something to watch. Sources: https://help.netflix.com/en/node/47765 and https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience
- Material communication patterns: confirmation for consequential choices and visible acknowledgment after state changes. Source: https://m2.material.io/design/communication/confirmation-acknowledgement.html
- WCAG 2.2 direction: visible focus, target size, and accessible state communication matter for keyboard and mobile users. Source: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/

## 3. Current UX Rating

| Area | Rating | Notes |
| --- | --- | --- |
| Public/owner home browsing | Good foundation | Search, filters, compact cards, and private badges are useful. Anonymous copy needs correction. |
| Watch/player experience | Good | Familiar player controls and related videos work. Needs better continuity and error/noise polish. |
| Upload workflow | Medium | The two-step upload/commit model is safe, but next actions and status clarity are weaker than modern upload tools. |
| Edit/delete management | Medium-good | Quick View keeps management centralized. Discoverability and modal density need work. |
| Visibility management | Good | Product policy is strong: private badge only, confirmation for publish, immediate privatize. Placement can be more visible. |
| Mobile UX | Medium | Layout is usable, but action discovery and repeated card scanning are weaker than desktop. |
| Accessibility | Medium-good | Semantic labels are mostly present. Hidden hover actions and some icon-only controls should be reviewed. |

## 4. What Works Well

### 4.1 Personal Vault Tone

The UI avoids social-platform patterns: no channels, comments, likes, follower language, or public-profile framing. This matches the product strategy better than copying YouTube directly.

Netflix and YouTube optimize for scale, recommendation loops, and public distribution. Mediavault should optimize for trust, quick retrieval, and owner control. The current dark, compact, low-decoration interface fits that direction.

### 4.2 Public/Private Visibility Model

The current visibility UX follows a sensible security pattern:

- public videos have no badge
- private videos show a `Private` badge
- non-owners do not see management controls
- `private -> public` requires confirmation
- `public -> private` happens immediately

This is better aligned with privacy expectations than making visibility a casual inline toggle on every card. YouTube exposes visibility as an explicit content-management setting; Mediavault's Quick View model is a simpler version of that pattern.

### 4.3 Upload Safety

The upload flow separates file staging from final library commit. That is good for a vault product because it gives the owner a review step before the video becomes part of the library.

The UI also includes:

- drag-and-drop and file picker
- supported formats and max size
- determinate progress percentage
- metadata review before final add
- retry/remove affordances

This satisfies NN/g's system-status principle better than a silent upload.

### 4.4 Player Layout

The player page is content-first. It does not wrap the player in decorative cards or marketing chrome. Related videos sit beside the player on desktop and below it on mobile, which matches common YouTube-like watch-page expectations without importing YouTube's clutter.

## 5. Main UX Problems

### P0: Anonymous Home Says `My Library`

For anonymous visitors, the home page still presents the primary heading as `My Library`. That is correct for the owner, but wrong for public visitors.

Why it matters:

- It creates a false ownership mental model.
- It may imply the anonymous user has a personal account/library when they do not.
- It conflicts with the new public-access model.

Industry comparison:

- Netflix frames the home as personalized only when the viewer is a member/profile.
- YouTube distinguishes viewer surfaces from creator Studio/content-management surfaces.

Recommendation:

- Anonymous heading: `Public Videos` or `Mediavault`
- Owner heading: `My Library`
- Anonymous count copy: `Showing N public videos`
- Owner count copy can remain `Total N videos - Showing N`

### P0: Anonymous Users Have No Obvious Login Entry Point

The anonymous home surface shows public videos, search, filters, and library navigation, but no visible `Sign in` or owner-mode entry point.

Why it matters:

- An owner landing on the public home has to know or guess `/login`.
- This violates recognition-over-recall: the action exists in the system, but the user must remember or infer where it is.
- It also weakens consistency with common video services, where signed-out users are normally given an explicit sign-in affordance.

Industry comparison:

- YouTube's signed-out surface keeps a visible sign-in path while still allowing browsing.
- Netflix's public surfaces distinguish visitor mode from member/account access instead of leaving the account transition undiscoverable.

Recommendation:

- Add a visible `Sign in` action to anonymous desktop and mobile headers.
- Keep upload/manage navigation hidden until authenticated.
- If the public home keeps the sidebar, add `Sign in` at the bottom or account area so the anonymous-to-owner transition is discoverable.

### P1: Owner Actions Are Too Hidden On Cards

The card action menu appears as a hover/focus affordance. This keeps the grid clean, but it makes Quick View, edit, delete, and visibility discovery weaker.

Why it matters:

- Desktop users may not discover management unless they hover.
- Touch users do not have hover.
- Quick View is currently the gateway to all management actions, including visibility.

Industry comparison:

- YouTube Studio uses an explicit content table and visible row actions because creator tasks are management-heavy.
- Netflix can hide secondary controls because watching is the dominant task, not management.

Recommendation:

- Keep cards clean for anonymous/read-only users.
- For owner-owned videos, make the action trigger persistently visible or visible on the private/public owned-card state.
- Consider a clearer `Manage` menu label in Quick View or card actions for owner mode.

### P1: Quick View Is Doing Too Much Below The Fold

Quick View contains edit entry, hero thumbnail, play button, description, tags, metadata, visibility management, watch/delete/close. On a normal desktop viewport, the visibility section may be below the visible part of the modal.

Why it matters:

- The most sensitive owner controls, especially `Make Public`, are not immediately discoverable.
- Inline success/error feedback can appear away from the user's visual focus.
- Users may interpret Quick View as read-only because the top portion is dominated by the preview image.

Recommendation:

- Reduce preview height inside Quick View or use a two-column layout on desktop: media preview left, metadata/actions right.
- Put owner management actions in a stable visible area near the top: `Edit Info`, `Visibility`, `Delete`.
- Keep `Watch` primary, but do not let the preview consume the whole management dialog.

### P1: Upload Completion Does Not Strongly Offer The Next Best Action

After successful add-to-library, the UI shows a success message and `Upload Another Video`. It does not prominently offer `View in Library`, `Watch`, or `Open video`.

Why it matters:

- The user's natural next step after upload is often to verify playback or inspect the created item.
- YouTube and cloud media tools typically route users toward reviewing, editing, or opening the uploaded asset.

Recommendation:

- After commit success, show primary action `Open Video` or `View in Library`.
- Keep `Upload Another Video` as secondary.
- If possible, use the returned `videoId` from commit response to link directly to `/player/:id` and/or `/?q=<title>`.

### P1: Upload Privacy State Is Not Visible At The Point Of Commit

New uploads default to private, which is correct. The upload screen does not clearly say that the video will be private after adding.

Why it matters:

- Privacy is now a core product concept.
- YouTube makes visibility explicit in upload/publish workflows.
- Users need confidence that upload does not automatically publish.

Recommendation:

- In the review card, add a non-editable status line: `Visibility: Private`
- Add helper copy: `New uploads are private until you make them public from Quick View.`
- Do not add a visibility selector here unless product scope changes; just communicate the default.

### P1: Upload Review Layout Feels Visually Busy

The upload flow correctly includes file state, progress, metadata, taxonomy, and final commit. However, once a file is selected these elements appear in one dense card with similar visual weight.

Why it matters:

- The user must distinguish at least three different concepts: uploaded file, editable metadata, and final library commit.
- Similar card, field, and status weights increase scanning cost.
- The most important decision, `Add to Library`, competes with metadata controls and status badges.

Recommendation:

- Separate the flow into clearer sections: `1. File`, `2. Details`, `3. Add to library`.
- Give the final commit area stronger hierarchy and keep advanced metadata compact.
- Move supported-format/static constraints out of the active review card after a file has already been selected.

### P2: Search And Filters Are Functional But Not Yet Strong Discovery

Current search is simple and fast. Filters support required tags, excluded tags, content type, and genre. This is useful for a personal library, but there are gaps compared with mature browse/search UX.

What is missing:

- sort options such as recently added, title, duration
- a visible active sort state
- grouping/rows such as `Recently added`, `Private`, `Public`, or `Continue watching`
- empty-state suggestions based on available tags

Industry comparison:

- Netflix relies heavily on browse rows and shortcuts for discovery.
- Faceted search patterns work best when filters are visible, understandable, and easy to clear.

Recommendation:

- Add a simple `Sort` control before adding richer recommendation features.
- Consider owner-only quick filters: `All`, `Private`, `Public`.
- Keep the existing advanced filter drawer/sheet for tags and taxonomy.

### P2: Player Continuity Is Basic

The player page has good foundations, but the watch experience is minimal.

Gaps:

- back link always goes to `/`, so prior search/filter context may be lost
- no resume/continue-watching state
- no next/previous affordance
- related videos are tag-filterable but not strongly explained

Industry comparison:

- YouTube's watch page emphasizes continuity through related videos and next actions.
- Netflix emphasizes resume and recommendations.

Recommendation:

- Preserve return context from home to player when possible.
- Add `Recently watched` or `Continue watching` later if playback progress becomes part of scope.
- Keep related videos simple; avoid autoplay unless explicitly desired.

### P2: Visual Information Density Is Uneven

The home grid is efficient, but thumbnails dominate on mobile and Quick View. Metadata is sparse: title, date, duration, tags. For a personal vault, richer scanning may matter more than cinematic presentation.

Recommendation:

- Home card owner mode could optionally show one secondary metadata line: content type or visibility/owner action state.
- On mobile, reduce image height slightly or make cards denser if library size grows.
- Improve thumbnail quality/consistency where fixtures or generated thumbnails look noisy; real user trust depends heavily on thumbnail recognizability.

### P2: Dev/Playback Console Noise Should Be Checked

During local dev visual inspection, the player rendered but browser console showed repeated `401` manifest load errors before/while playback initialized. E2E coverage already validates the protected token path, so this may be a dev-session artifact, but it is worth checking because visible playback reliability is central to UX.

Recommendation:

- Confirm in built hermetic smoke whether manifest requests ever fire without the final Authorization token.
- If harmless, suppress avoidable pre-token media loads.
- If real, make the loading state wait until token/manifest URL is fully ready before mounting the media source.

## 6. Flow-by-Flow Review

### 6.1 Enter Site And Browse

Current state:

- Anonymous users can enter directly.
- Owner navigation appears only after login.
- Search is available in the top bar.
- Filters are accessible through a button.
- Private badges are visible only for owner-accessible private videos.

Assessment:

- Strong for a personal vault.
- Weak for public visitor framing because `My Library` implies ownership.
- Discovery will degrade as the video count grows because there is no sorting or row structure.

Recommended changes:

1. Split anonymous and owner heading/counter copy.
2. Add sort: `Recently added`, `Title`, `Duration`.
3. Add owner quick filter: `All`, `Public`, `Private`.
4. Keep card UI simple for anonymous viewers.

### 6.2 Watch Video

Current state:

- Player uses familiar controls.
- Metadata and tags appear below the player.
- Related videos appear right on desktop and below on mobile.

Assessment:

- Good enough for MVP/personal vault.
- Better than overbuilding a Netflix clone.
- Needs return-context preservation and fewer transient media errors.

Recommended changes:

1. Preserve search/filter context when entering and leaving player.
2. Add a clearer related-video empty state if no related videos exist.
3. Investigate dev console 401 manifest noise.

### 6.3 Upload Video

Current state:

- Drag/drop and file picker are clear.
- Upload starts immediately.
- Metadata can be edited before final commit.
- Progress and errors are visible.

Assessment:

- Safe and operationally clear.
- Less polished than creator tools because completion does not route to the new asset.
- Privacy default is not visible enough.

Recommended changes:

1. Add `Visibility: Private` to the review card.
2. After success, show `Open Video` as primary and `Upload Another Video` as secondary.
3. Add estimated processing stage copy if transcoding/preparation is slow.
4. Consider a small video preview after upload if browser-supported.
5. Restructure selected-file state into clearly labeled file/details/commit sections.

### 6.4 Edit And Delete

Current state:

- Edit Info exists in Quick View.
- Delete uses confirmation.
- Non-owners do not see edit/delete controls.

Assessment:

- Security and permission model are strong.
- Quick View placement makes management discoverability weaker.

Recommended changes:

1. Make Quick View owner actions more visible near the top.
2. Keep delete confirmation; no need for typed confirmation in a personal vault unless destructive mistakes become common.
3. Add a clearer post-edit success state if edits are slow or remote.
4. Make `Edit Info` read as an editable detail mode, not just a small secondary button above the preview.

### 6.5 Visibility Management

Current state:

- Correct permission gating through `permissions.canManageVisibility`.
- Confirmation for making public uses explicit privacy copy.
- Making private is immediate.
- Inline success/error exists.

Assessment:

- Product policy is well designed.
- UI placement is the main issue.

Recommended changes:

1. Move visibility status/action higher in Quick View.
2. Keep the current confirmation copy.
3. Add upload review copy that explains new videos start private.

## 7. Prioritized Backlog

### High Impact / Low Risk

1. Anonymous sign-in entry point
   - Add visible `Sign in` on public desktop/mobile home.

2. Anonymous home heading copy
   - Owner: `My Library`
   - Anonymous: `Public Videos`

3. Upload success next action
   - Primary: `Open Video`
   - Secondary: `Upload Another Video`

4. Upload review privacy copy
   - `Visibility: Private`
   - `New uploads are private until you make them public from Quick View.`

5. Quick View action placement
   - Keep preview, but expose visibility/edit/delete higher.

### Medium Impact

6. Persistent owner card action affordance
   - Especially for touch/mobile and owner mode.

7. Sort control
   - `Recently added`, `Title`, `Duration`.

8. Return-context preservation from player
   - Preserve current search/filter URL when opening player.

### Later

9. Continue watching / resume
   - Only once playback progress persistence is accepted.

10. Thumbnail quality improvements
   - Important when real libraries grow.

11. Richer browsing rows
   - `Recently added`, `Private`, `Public`, or saved collections.

## 8. What Not To Do

- Do not turn the product into YouTube Studio. The project does not need public creator analytics, channels, comments, subscriber concepts, or multi-state publishing.
- Do not copy Netflix's entertainment-heavy recommendation interface too early. Mediavault has a small personal-library use case; filters, sort, and clear metadata are more valuable first.
- Do not add visibility toggles directly on every card until accidental publishing risk is considered.
- Do not make upload public by default.

## 9. Bottom Line

The current UI/UX is a good functional baseline. It is strongest where the product needs security and permission clarity, and weakest where users need fast discovery and confidence about the next step.

The next UX pass should be small and practical:

1. fix anonymous/owner copy
2. add an anonymous sign-in entry point
3. make upload completion actionable
4. make private-by-default visible during upload
5. improve Quick View management discoverability
6. add sort and return-context polish

These changes would noticeably improve day-to-day usability without expanding product scope or weakening the public/private security model.
