# Anonymous Media Abuse Controls Follow-Up

Status: Blocker before public internet exposure

Date: 2026-05-28

## Purpose

Milestone 5 opens anonymous same-origin public playback for a personal-vault
deployment. Before exposing the service to the public internet, anonymous media
routes need explicit resource-consumption controls beyond the current validation
and short-lived-token safeguards.

## Required Controls

- Add token issuance rate and burst limits for anonymous viewers.
- Add missing-token and invalid-token loop throttling for playback media routes.
- Add ClearKey/license request rate limits and keep request body size bounded.
- Add range request count and size policies for segment routes.
- Add operational metrics or structured counters for denied token, license, and
  range requests without logging bearer tokens or private metadata.

## Current Milestone 5 Boundaries

- Playback tokens are short lived and scoped to one video.
- Manifest, segment, ClearKey, token, and denial responses are non-cacheable.
- Segment filenames and paths are validated before filesystem access.
- Range syntax and unsatisfiable ranges are validated only after playback access
  is authorized.
- Same-origin delivery remains the only supported Milestone 5 media transport.

## Exit Criteria

- Anonymous token issuance is rate limited.
- Invalid or missing token request loops are throttled.
- ClearKey/license requests have documented size and rate behavior.
- Segment range abuse has documented count/size behavior.
- Tests cover the limits without depending on wall-clock sleeps.
