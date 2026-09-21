---
name: project-ss88-pins-photo-upload-review
description: SS-88 (sanpo_maps/pins domains, presigned POST photo upload, dev-storage, thumbnails) security review outcome — no Crit/High/Med, 3 Low findings, all mitigations verified in code.
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
---

Reviewed 2026-09-21 on branch `ss-88` (`git diff origin/main...HEAD -- packages/backend docs/adr`).
Full report was written to a task-local file under `tmp/` (not durable) — key facts captured here.

- **Outcome**: no Critical/High/Medium. 3 Low findings, none blocking:
  1. `PinPhotoUploadRepository.find_attachment` (pins/repository.py) is the one repository
     method not scoped by `user_id` — queries `pin_photos JOIN pins` by `upload_id` alone across
     all users. No practical exploit (upload_id is an unguessable UUIDv4, and the only caller,
     `PinService.add_photos`, folds the result into the same generic 409 either way), but it's an
     exception to this repo's otherwise-consistent "every repo method takes `user_id`" rule
     — worth a quick look if this file changes again.
  2. No dedicated rate limiting on `POST /pin-photo-uploads` / `POST /pins` / `POST
     /pins/{pin_id}/photos` (same accepted-tradeoff pattern as walks/maps, see
     [[project_ss18_walks_review]] / [[project_ss42_walks_stats_review]]).
  3. `pins/dev_storage_router.py`'s `POST /dev-storage/uploads` reads the whole multipart file
     into memory before checking `max_bytes` — dev/test-only (STORAGE_MODE=fake fails startup
     outside local/test per `config.py`'s allowlist validator), so low impact.
- **Mitigations verified as actually implemented (not just planned)**:
  - IDOR: `SanpoMapRepository`/`PinRepository`/`PinPhotoUploadRepository` read methods all
    require `user_id` and JOIN through `sanpo_map_members`; cross-owner access is 404, matching
    [[project_sanposcape_conventions]].
  - Presigned POST: `content-length-range` + exact `Content-Type` Condition in
    `integrations/aws/s3.py::S3ObjectStorage.create_upload_form`; `key` exact-match comes from
    boto3's implicit condition (no `${filename}` wildcard used); no ACL/SSE fields (bucket is
    BucketOwnerEnforced + SSE-S3 default).
  - Decompression bomb: `pins/thumbnails.py::make_thumbnail` checks `width*height > max_pixels`
    right after `Image.open()` (header-only read) and *before* `image.load()`/`draft()` — rejects
    before any large pixel buffer is allocated. Doesn't rely on global `Image.MAX_IMAGE_PIXELS`
    (deliberately, since that's process-global and this runs under a `ThreadPoolExecutor` with
    concurrency=3 — a global setting would be a race risk across threads).
  - dev-storage prod exposure: 4-layer fail-safe mirroring the AUTH_MODE/MAPS_MODE pattern —
    `Settings.storage_mode` default `real`; `main.py` only includes
    `pins_dev_storage_router` when `storage_mode == "fake"`; router itself has
    `include_in_schema=False`; `Settings._validate_environment_settings` hard-fails startup if
    `env not in ("local","test")` and `storage_mode != "real"`. See
    [[sanposcape_auth_architecture_notes]] for why this allowlist-not-denylist shape matters
    (staging bypass precedent).
  - Quota race (B-D5): `POST /pin-photo-uploads` serializes via
    `pg_advisory_xact_lock(namespace, user_id_folded)` (transaction-scoped, deterministic fold —
    not Python's `hash()`). The *confirm* path (`PinService._prepare_photos`) doesn't take this
    lock but doesn't need it: capacity is always `attached_total + reserved_total`, and pending
    reservations stay counted (status flips to `attached` only at commit) — traced through
    concurrent-different-uploads and concurrent-same-upload (blocked by `FOR UPDATE` on the
    `pin_photo_uploads` row) cases and found no double-count/bypass window.
- **New durable pattern for this repo**: `STORAGE_MODE=real|fake` + `UnconfiguredObjectStorage`
  in `integrations/aws/s3.py` follows the exact same fail-safe shape as `MAPS_MODE`/
  `FEATURE_FLAG_MODE` (see [[project_ss44_maps_fake_review]] for the sibling review). Expect any
  future `integrations/aws/*` addition to follow this same 3-mode + allowlist-validator shape —
  check for it rather than re-deriving from scratch.
