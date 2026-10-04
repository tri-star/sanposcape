---
name: feedback-existing-table-column-add-deploy-window
description: 既存テーブルへの列追加は「deploy → 手動 migrate」の間、そのテーブルを ORM で読む全 API が 500 になる。マイグレーション Lambda は API と同じ成果物なので先に migrate できない。prod 稼働後はマイグレーション単独 PR が要る
metadata:
  type: feedback
  scope: durable
---

ADR-005 決定9 のマイグレーション Lambda は API 本体と同じ `CodeUri`。CI/手動デプロイ（`sam deploy`）の後で migrate を
invoke するので、**新しいリビジョンを、それを使うコードより先に流す手段が無い**。新規テーブルの追加なら新しい API が落ちるだけだが、
既存テーブルにモデルの列を足すと、そのテーブルを SELECT する既存 API がすべて `UndefinedColumn` で 500 になる
（SS-171 の `sanpo_maps.icon` が最初の事例。`/sanpo-maps` 全般・`POST /pins`・`GET /pins` が該当。SS-173 の `pins.visited`/`archived` も同じ形で、ADR-009 決定32 に手順を記録）。

**Why:** ADR-008 決定7 の本文は「列追加は NULL 許容にすれば安全」と読めてしまう（SS-171 で決定7 に追補し、`docs/release-runbook.md` §2・§7.4 にも手順を足した）。NULL 許容・server default が守るのは**古いコード × 新しいスキーマ**の向きだけで、
**新しいコード × 古いスキーマ**の空白は防げない。

**How to apply:** 既存テーブルへの列追加を含むプランでは、デプロイ順序を必ず節として書く。
- prod が未稼働（2026-10-04 時点）なら、dev で「デプロイ直後に migrate」を推奨し、数分の 500 を許容するかをユーザーに確認する。
- マイグレーションは**モデル変更と別の単独コミット**にしておく（dev は任意の ref からデプロイできるので、その ref だけをデプロイ → migrate → 本体をデプロイ、という厳密な2段階デプロイも選べる）。
- 並行チケットが同じ Alembic head からリビジョンを切っていないか確認する（[[feedback-check-existing-and-parallel-work-before-planning]]）。
- prod の稼働後は、マイグレーションだけの PR を先に main に入れてデプロイ・migrate する（prod のデプロイは main からだけ）。
- NOT NULL + 定数の server default は、古いコードの INSERT を壊さない（PG11+ ではテーブルの書き換えも無い）ので、expand として扱ってよい。

関連: [[feedback-ci-test-db-shared-with-alembic]]
