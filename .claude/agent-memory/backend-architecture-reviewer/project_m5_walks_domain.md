---
name: project_m5_walks_domain
description: walksドメインのスコープ決定はADR-003が正本。SS-18の「集計/削除APIは作らない」はSS-42/SS-53で覆り実装済み。再指摘しない点の要約。
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-003-walk-record-persistence-and-history-api.md
---

walks ドメインの設計判断（終了時1回の `POST /walks`、JSONB軌跡、`client_walk_id` 冪等、
keyset ページング、他人の散歩は404、集計API `GET /walks/stats`、物理削除の
`DELETE /walks/{walk_id}`）はすべて `docs/adr/ADR-003-walk-record-persistence-and-history-api.md`
の決定1〜13に記録されている。レビュー時はまず ADR-003 の要約を読む。

**再指摘しないこと:**
- 「SS-18 で集計API・削除APIは作らない方針だったはず」→ SS-42（決定10〜12）・SS-53（決定13）で
  正式に覆っている。
- 「削除が非冪等（2回目は404）」→ 決定13のトレードオフとして明記済み。
- 「`WalkRepository.delete()` の select→delete→flush が同時2重DELETEで500になる」→ 手当て済み。
  `version_id_col` 無しでは `SAWarning` 止まりになる点まで考慮し、`flush()` の間だけ警告を例外に
  昇格させて捕捉し `False`（404）に揃えている（`walks/repository.py` の docstring 参照）。

**How to apply:** 逆に、ADR-003 の契約（snake_case、`client_walk_id` 冪等性、404方針、
期間フィルタは素の `timestamptz` 比較でインデックスを効かせる）から逸脱する変更があれば指摘する。
