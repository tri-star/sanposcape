---
name: project-ss113-sanpo-maps-management-review
description: SS-113 (sanpo_maps POST/PATCH/DELETE, GET ?expand=pin_count) security review outcome — no Crit/High/Med, 3 Low/informational, all mitigations verified in code.
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
  source_issue: SS-113
---

Reviewed 2026-09-26 on worktree `ss-113` (`git diff main...HEAD`, backend
`sanpo_maps/`/`pins/`/`dependencies.py`/`main.py`).

- **Outcome**: no Critical/High/Medium. 3 Low/informational, none blocking:
  1. `SanpoMapListQuery.expand` (`sanpo_maps/schemas.py:103`) has no `max_length`, unlike the
     sibling `PinListQuery.tags` (`pins/schemas.py:297`, `max_length=PIN_SEARCH_TAGS_MAX_COUNT`).
     Negligible impact: values are restricted to `Literal["pin_count"]` and the repeated-query-
     param length is bounded by the HTTP server's URL/header-line limit anyway.
     **Fixed in the same PR**: `max_length=8` (`SANPO_MAP_LIST_EXPAND_MAX_LENGTH`) was added after review.
  2. `PinRepository.count_pins_for_maps`/`list_photo_keys_for_map` (`pins/repository.py:450,461`)
     don't take `user_id` — same shape as the `find_attachment` exception noted in
     [[project_ss88_pins_photo_upload_review]]. Verified safe: both are only ever called with
     already-authorized `sanpo_map_id`s — `list_sanpo_maps` builds the id list from
     `SanpoMapRepository.list_for_member(user_id=current_user.id)`
     (`sanpo_maps/service.py:72`) before calling `count_pins_for_sanpo_maps`, and
     `SanpoMapService.delete_map` calls `contents.prepare_sanpo_map_deletion(sanpo_map_id)`
     only *after* `get_membership_for_update()` + `can_delete_sanpo_map(role)` pass. Confirmed by
     test `test_editor_raises_permission_denied_and_does_not_prepare_deletion`
     (`sanpo_maps/tests/test_service.py`).
  3. No rate limiting on `POST`/`PATCH`/`DELETE /sanpo-maps` — same accepted tradeoff as
     walks/pins ([[project_ss18_walks_review]], [[project_ss88_pins_photo_upload_review]]).
- **Mitigations verified as actually implemented**:
  - IDOR / 404-vs-403: `get_membership_for_update()` (FOR UPDATE lock) used by both
    `update_map`/`delete_map`; judged in the documented order member(404) → permission(403).
    `can_update_sanpo_map`/`can_delete_sanpo_map` (`sanpo_maps/permissions.py`) require
    `role == "owner"`; editor gets 403, non-member/deleted gets 404. Matches ADR-009 決定26.
  - `pin_count` aggregate (決定29) is scoped: ids come only from the caller's own
    `list_for_member` result, never from client input directly.
  - Map deletion → S3 cleanup: `prepare_sanpo_map_deletion(sanpo_map_id)` collects photo keys
    for exactly the authorized `sanpo_map_id` (JOIN `Pin.sanpo_map_id == sanpo_map_id`) *before*
    commit; the actual best-effort S3 delete (`cleanup()`) runs *after* `self._db.commit()` —
    same DB-commit-then-S3-best-effort order as 決定22 (pin deletion, SS-112). No path exists
    to move a pin between maps (`PinUpdate` schema has no `sanpo_map_id` field), so no
    cross-map/cross-owner photo-key leakage vector at delete time.
  - Name validation: `SanpoMapName = Annotated[str, Field(min_length=1, max_length=50)]`
    matches DB `String(50)` (code-point count, matches Python `len()` semantics even for
    astral-plane chars). Whitespace (incl. full-width U+3000) stripped `mode="before"`, so
    whitespace-only input correctly 422s via `min_length=1` after stripping.
  - Request size: `RequestSizeLimitMiddleware` registered for `/sanpo-maps` prefix
    (`main.py`) reusing `pins_request_max_bytes` (16KB default); prefix-matching is exact-segment
    (`core/middleware.py::_matches_prefix`), no `/sanpo-mapsFOO` bypass/over-match risk.
  - Error responses: `SanpoMapNotFoundError`/`SanpoMapPermissionDeniedError` handlers in
    `main.py` return fixed static `detail` strings only, no stack trace/internal leakage.
  - `sanpo_maps` → `pins` one-way dependency (no IDOR-relevant import cycle) enforced by
    `tests/test_dependency_direction.py` (AST-based check) and the `SanpoMapContents` Protocol
    port pattern (`sanpo_maps/contents.py`), wired in `dependencies.py::get_sanpo_map_contents`.
- **New pattern for this repo**: cross-domain port via `Protocol` + app-level `dependencies.py`
  wiring (not either domain's own `dependencies.py`) is now an established pattern
  (`SanpoMapContents`, ADR-009 決定29) — expect more of these as domains grow; when reviewing,
  check the *port's* docstring for the "caller must authorize before calling" contract (same
  discipline as [[project_sanposcape_conventions]]'s "authorize before decoding the cursor" rule)
  rather than assuming the port method itself re-checks ownership.
