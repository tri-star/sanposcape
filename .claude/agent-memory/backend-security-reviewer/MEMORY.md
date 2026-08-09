# Memory Index

- [SS-10 auth review findings](ss10_auth_review_findings.md) — staging env gap in fail-safe validator, missing max_length on auth schemas, no rate limiting anywhere in backend
- [Sanposcape auth defense-in-depth pattern](sanposcape_auth_architecture_notes.md) — how dev-mode bypass / token rotation is layered, useful checklist for future auth-related reviews in this repo
- [sanposcape backend security conventions](project_sanposcape_conventions.md) — IDOR pattern (404 not 403, user_id-required repos), cursor tokens don't need signing here
- [SS-18 walks review outcome](project_ss18_walks_review.md) — reviewed 2026-08-01, no Critical/High; minor Low findings (naive-datetime query filters, no rate limit on POST /walks)
- [SS-42 GET /walks/stats review](project_ss42_walks_stats_review.md) — reviewed 2026-08-09, no Crit/High/Med; Low: unbounded walks/day feeds per-request aggregate scan (no rate limit)
