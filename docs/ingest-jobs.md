# Ingest processing jobs

Mediavault runs one Node application/container and stores ingest jobs in its encrypted primary SQLite database. It does not require Redis or a separate queue deployment. This is an ingest workflow, not a general-purpose job platform.

## Upload and acceptance

1. The browser transfers one file to a request-scoped temporary path. This byte transfer is **not resumable**. Temporary paths never derive their directory structure from the submitted filename.
2. The application validates the file type, creates an owner-bound staged upload and releases request-temporary bytes. Unaccepted staged uploads have a 24-hour expiry.
3. Submitting metadata atomically creates a job, reserves its final video identity and pins the staged source. HTTP `202` means **accepted for processing**, not added to the library.
4. The browser can now navigate away or reload. The upload page retrieves the authenticated account's active and recent jobs from the server.

Acceptance is idempotent for the same staged source and normalized metadata. Different metadata against an already accepted job is a conflict, not a second video. The server derives ownership from the authenticated session; request-body ownership is ignored.

## Execution and publication

- One complete ingest workflow runs at a time. Admission permits at most 21 queued/running jobs in total.
- A running attempt has a unique fencing token, a 90-second lease and a 15-second renewal interval. An expired lease is recovered; a restart does not blindly reset every running row before its lease expires.
- The phases are probing, preparing, packaging, thumbnail protection, verification and publication. The UI does not invent processing percentages or an ETA.
- Media tools write into a private attempt directory. The thumbnail is encrypted and verified before publication. Preparation and file/directory synchronization happen outside SQLite's writer transaction.
- Publication checks the current lease and the absence of a ready video, promotes the attempt to canonical playback paths, and commits video metadata, media references, tags, genres, staged state and job success together.
- A video is created as **private**. A successful job exposes watch and edit links only after the database publication commits.

Filesystem rename and SQL commit are not one host-power-loss transaction. If the process fails between them, the canonical directory can be an unpublished orphan: no ready database record means it is not playable. A subsequent fenced attempt quarantines that orphan before promotion. Cleanup never recursively deletes the canonical directory selected by a ready video.

This supports application/container restart recovery. It does not promise exactly-once FFmpeg execution or unconditional host-power-loss atomicity. Operators should investigate reported orphan/integrity problems rather than delete arbitrary storage directories.

## Retry, cancellation and removal

- Explicitly classified transient failures retry automatically, with three attempts per retry budget. Delays are approximately 5 seconds and 30 seconds, plus jitter. Unknown failures are not automatically retried forever.
- **Retry processing** reuses the staged source, job identity and reserved video identity. It grants another bounded attempt budget. If the source is missing, upload a replacement instead.
- **Cancel processing** records cancellation. A running job is not terminal until its actual media process closes. Subprocess supervision sends TERM, escalates to KILL when necessary and waits for close before freeing its slot or deleting attempt files.
- **Remove staged file** is a separate, confirmed action for failed/cancelled work. A persisted `removing` source state fences removal against acceptance/retry. If filesystem removal fails, the owner can retry removal; the source row is not silently forgotten.
- Accepted job inputs and failed processing history are excluded from ordinary staging expiry. There is no automatic destructive failed-source/history retention policy.

After publication, source unlinking is separately tracked by a persisted cleanup flag. A cleanup failure does not roll back a successfully published video; the runner retries cleanup. Deleting that video does not drop a pending source-cleanup intent: the staged row becomes `removing` and continues to guard account deletion. Successful unlink acknowledgement then retires the deleted video's staging/job history. If cleanup already finished, normal video deletion can cascade that history immediately.

Account deletion rejects outstanding staged uploads, queued/running jobs, retained failed/cancelled sources and pending source cleanup. Source-free completed history alone is not an active-upload guard. Owned videos remain subject to the separate account-deletion policy; video deletion retires its staging/job history once pending source cleanup completes, and account deletion cleans owned playlists and remaining committed history.

## HTTP contract

All job views are owner-scoped, private/no-store responses. Missing and another account's resources use the same not-found contract. Views exclude source paths, ownership tokens, request hashes, media keys and raw tool output.

| Endpoint                         | Method       | Purpose                                                      |
| -------------------------------- | ------------ | ------------------------------------------------------------ |
| `/api/uploads`                   | POST         | Receive one nonresumable byte transfer                       |
| `/api/uploads/:stagingId`        | GET / DELETE | Read owned staged state / explicitly remove eligible source  |
| `/api/uploads/:stagingId/commit` | POST         | Accept processing; `202` unfinished or `200` terminal replay |
| `/api/ingest-jobs`               | GET          | Active-first, bounded/paginated job list                     |
| `/api/ingest-jobs/:jobId`        | GET          | Owned job status                                             |
| `/api/ingest-jobs/:jobId/retry`  | POST         | Explicit bounded processing retry                            |
| `/api/ingest-jobs/:jobId/cancel` | POST         | Request cancellation                                         |

Full admission returns `503` with `Retry-After`. Semantic state conflicts return `409`; a source that needs re-upload is reported explicitly. Mutations use the same protected-session and same-origin policy as other authenticated APIs.
