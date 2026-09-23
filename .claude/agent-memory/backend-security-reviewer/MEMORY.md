# Memory Index

- [SS-10 auth review findings](ss10_auth_review_findings.md) — stagingのvalidator穴とbody sizeは解消済み（再指摘しない）。/auth/* のレート制限のみ未対応
- [Sanposcape auth defense-in-depth pattern](sanposcape_auth_architecture_notes.md) — how dev-mode bypass / token rotation is layered, useful checklist for future auth-related reviews in this repo
- [sanposcape backend security conventions](project_sanposcape_conventions.md) — IDOR pattern (404 not 403, user_id-required repos), cursor tokens don't need signing here
- [SS-18 walks review outcome](project_ss18_walks_review.md) — reviewed 2026-08-01, no Critical/High; minor Low findings (naive-datetime query filters, no rate limit on POST /walks)
- [SS-42 GET /walks/stats review](project_ss42_walks_stats_review.md) — reviewed 2026-08-09, no Crit/High/Med; Low: unbounded walks/day feeds per-request aggregate scan (no rate limit)
- [SS-44 fake maps provider review outcome](project_ss44_maps_fake_review.md) — reviewed 2026-08-08, no Critical/High; MAPS_MODE fail-safe mirrors AUTH_MODE allowlist pattern
- [SS-33 loop route review outcome](project_ss33_loop_route_review.md) — reviewed 2026-09-15, no Crit/High/Med; Low: no O-D distance cap (resample cost), loop rate-limit shared w/ places (accepted tradeoff)
- [SS-88 pins/photo-upload review outcome](project_ss88_pins_photo_upload_review.md) — reviewed 2026-09-21, no Crit/High/Med; 3 Low (find_attachment unscoped, no rate limit, dev-storage unbounded read)
- [SS-88 observability log review](project_ss88_observability_log_review.md) — reviewed 2026-09-24, no findings; AccessLogMiddleware/upload-issue log verified to leak nothing
