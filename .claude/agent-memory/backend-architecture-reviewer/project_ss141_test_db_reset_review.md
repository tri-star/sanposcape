---
name: project_ss141_test_db_reset_review
description: SS-141 テスト用DB分離方式(ADR-B-001)のアーキテクチャレビュー結果。Critical/Warning無し、DELETE採用は妥当
metadata:
  type: project
  scope: durable
  adr: packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md
---

SS-141（`packages/backend/src/sanposcape/conftest.py`）は、テストごとの `create_all`/`drop_all`
（DDL）を、session スコープでスキーマを1回だけ作り各テストの**前**に `DELETE FROM`（`Base.metadata.sorted_tables`
の逆順）でテーブルを空にする方式に変更した（ADR-B-001採用、実装済み）。アーキテクチャレビュー結果は
Critical/Warning無し、Suggestionのみ（`_delete_all`のロックタイムアウト失敗が次テストのせいに見える点、
`all_models.py`への追加漏れが`_delete_all`対象からも漏れる点、ADR内の安定性確認回数の表現がやや読みにくい点）。

**Why:** 約1,100件のテストで setup+teardown が全体時間の8割を占めていた（PR #103レビューF-005）。
TRUNCATE(47.24s)よりDELETE(32.81s)が計測で明らかに速く（許容誤差3%を超過）採用された。
外側トランザクション+savepoint案は、`test_commits_and_is_visible_from_another_session`
（`sanpo_maps/tests/test_service.py`）や `pg_advisory_xact_lock` を使ったFOR UPDATE直列化
（`auth/tests/test_repository.py` 等、いずれもトランザクションスコープのadvisory lockのみ使用で
セッションスコープのlock残留リスクは無いことを確認済み）の意味を壊すため不採用。

**How to apply:** 今後この conftest.py や ADR-B-001 に関わる変更（fixture順序、後始末方式の再変更、
`all_models.py` へのモデル追加漏れ等）をレビューする際は、この判断根拠を壊していないかを起点に確認する。
とくに「`_setup_test_db_schema`(session)が`_reset_tables`(function)より先に実行される」「テストの前に空にする
（後ではない、teardown失敗の連鎖防止のため）」の2点は意図的な設計であり、変更時は理由の再確認が必要。
pytest-xdist導入によるワーカー並列化（本チケットのスコープ外、別チケット候補）をレビューする際は、
ワーカーごとのテスト用DB分離とこのDELETE方式の組み合わせに注意する。
