---
name: project-ss111-pins-read-api-review
description: SS-111 (pins read API: GET /pins, /pins/{id}, /pins/{id}/photos, original_url) security review outcome — no Crit/High/Med, all IDOR/ILIKE/cursor/presigned-URL checks verified in code and tests.
metadata:
  type: project
  scope: task-local
  source_issue: SS-111
---

Reviewed 2026-09-24 on branch `tri-star/ss-111-pin-read-api` (`git diff origin/main...HEAD --
packages/backend`).

- **Outcome**: no Critical/High/Medium findings. Only Low/informational notes (no rate limit on
  the new GET endpoints — same accepted tradeoff as [[project_ss18_walks_review]]/
  [[project_ss42_walks_stats_review]]/[[project_ss88_pins_photo_upload_review]]; `cursor` query
  param has no `max_length`, matching existing `walks/router.py` precedent, not a new deviation).
- **IDOR**: `PinRepository.list_for_member`/`get_for_member` both JOIN through
  `sanpo_map_members` on `user_id` (multi-layered with the service-level `get_role()` check),
  matching [[project_sanposcape_conventions]]. All 3 new endpoints (`list_pins`, `get_pin`,
  `list_pin_photos`) return 404 (not 403) for non-member/non-existent resources, verified by
  dedicated tests (`test_non_member_sanpo_map_id_is_404`, `test_non_member_pin_returns_404` x2).
  `list_photos_page` (repo) is intentionally *not* self-scoping — relies on caller checking
  `get_for_member()` first, same pre-existing pattern as `list_photos()`/`count_photos()`/
  `load_read_model()`, and the one new caller (`PinService.list_pin_photos`) does check
  membership before touching the cursor or calling it.
- **Auth-check-before-cursor-decode ordering verified**: in both `PinService.list_pins` and
  `list_pin_photos`, the membership/role check happens *before* `decode_cursor`/
  `decode_position_cursor`. This avoids an oracle where a non-member probing with a garbage
  cursor would get 400 instead of 404 and could infer resource existence/membership.
- **ILIKE escaping**: `pins/repository.py::_escape_like` escapes `\` before `%`/`_` (correct
  order) and every `.ilike()` call passes `escape="\\"` consistently; a dedicated test
  (`test_q_treats_percent_and_underscore_as_literals`) confirms literal `%`/`_` in `q` don't act
  as wildcards. No SQL injection risk regardless (SQLAlchemy bound params throughout — no raw
  SQL/string concatenation in this diff).
- **Cursor tampering**: both new cursor types (`encode_cursor`/`decode_cursor` for
  `(created_at, id)`, new `encode_position_cursor`/`decode_position_cursor` for `(position, id)`
  added in `core/pagination.py`) are unsigned base64, consistent with
  [[project_sanposcape_conventions]]'s documented rule — safe only because every consuming query
  also applies the caller's own membership/ownership filter, which holds here (cursor reuse
  across a different `sanpo_map_id`/`pin_id` just narrows/misses rows, doesn't bypass the
  membership WHERE clause; path-param `pin_id` authorization is checked independently of the
  photos-page cursor).
- **Presigned GET (`original_url`)**: reuses the pre-existing, already-reviewed
  `ObjectStorage.create_download_url` (SS-88) — single-key `get_object` presign, TTL bounded by
  `Settings.pin_photo_download_url_ttl_seconds` (`ge=60, le=43_200`, i.e. max 12h). Not a new
  code path, just a new call site on `photo.s3_key` (the original, not a user-controlled path).
  `boto3.generate_presigned_url` is a local SigV4 computation (no network call), so `limit=200`
  list items each generating both a thumbnail and original presigned URL is a CPU-only cost, not
  an S3-API-quota risk.
- **Info leak check**: `PinListItemRead` deliberately omits `memo` (per D5) even though `q`
  matches against `memo` server-side — the match itself isn't exposed, only boolean inclusion in
  results the requester is already a member for. `SanpoMapSummaryRead` embedded in `PinRead` is
  minimal (id/name/is_default only), pre-existing and unchanged. Exception handlers for
  `SanpoMapNotFoundError`/`PinNotFoundError`/`InvalidCursorError` return fixed generic `detail`
  strings, no stack traces/internal paths.
