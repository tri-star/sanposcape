---
name: project_ss53_walks_delete_review
description: SS-53（DELETE /walks/{walk_id}）のコード品質レビューで把握した設計判断と全体品質の所感。
metadata:
  type: project
---

2026-08-12 時点、ブランチ `tri-star/ss-53` で `DELETE /walks/{walk_id}` を追加。ADR-003 に「13. 散歩の削除は物理削除で行い、DELETE /walks/{walk_id} を提供する（SS-53 追補）」として丁寧に追補されている（`docs/adr/ADR-003-walk-record-persistence-and-history-api.md`）。

**Why:** 物理削除を選択（論理削除は一覧・集計・streak 全クエリに除外条件が必要で漏れリスクが高いため却下）。削除APIは意図的に非冪等（2回目は404）。理由はtombstoneを持たないと「削除済み」と「未存在」を区別できず、D6（存在漏洩防止）と衝突するため。

**How to apply:** walks/ を触るPRのレビュー時、この設計判断（物理削除・非冪等・集計は都度クエリなので削除に追従・cursorは値比較なので削除に強い）を前提にしてよい。

品質は全体的に高い（[[project_ss18_walks_review]] の路線を踏襲）。router/service/repository/exceptions 全層でD6（IDOR対策・403にせず404）を一貫。track_pointsのdeferを削除経路のSELECTにも適用。テストがrepository/service/router 3層で「他人の散歩・存在しないID・削除後の一覧/詳細/stats/streak/cursorへの波及・非冪等の2回目404」まで丁寧にカバー。openapi.jsonもDELETE操作込みで再生成済み。

唯一の実質的な指摘は select→delete→flush 方式のレース（[[pattern_select_then_delete_race]]、StaleDataErrorが未捕捉で500になりうる）。users/repository.py にも同型の既存バグがあり、このPRが新規に持ち込んだわけではなく既存パターンを踏襲した結果。

**2026-08-13 追記（対応済み確認）**: `WalkRepository.delete()`（`walks/repository.py`）はこの後の対応で修正済みを確認。`version_id_col` が無いと `StaleDataError` ではなく `SAWarning` にしかならない（SQLAlchemy仕様）という点まで踏み込み、`flush()` の間だけ `warnings.simplefilter("error", sa_exc.SAWarning)` で警告を例外に昇格させた上で `StaleDataError` と `SAWarning` の両方を捕捉して `False` を返すようにしている。docstringにもこの仕様と判断根拠が詳細に書かれている。[[pattern_select_then_delete_race]] は users/repository.py 側にはまだ残っている可能性があるので、そちらを触るPRでは改めて確認すること。

**2026-08-13 レビュー（PR #47フォローアップ、commit b585bfa/36cec95）**: `router.py` の `_ERROR_RESPONSES_NO_BODY` を廃止して全エンドポイント（GET/DELETE含む）を `_ERROR_RESPONSES`（401+413）に統一し、`openapi.yaml` を再エクスポート、`service.py::delete_walk` のdocstringを実装の実態（`repository.delete()`が見つかった場合はflushする点、競合時はflush失敗でFalseになる点、rollbackを明示しない理由）に合わせて修正。デッドコード・不要テストの残存なし（grep で `_ERROR_RESPONSES_NO_BODY` は `.claude/agent-memory/backend-developer/` の記録以外どこにも残っていないことを確認）。docstringの内容も `database.py:get_db()` の `finally: db.close()` および `WalkRepository.delete()` の実装と整合していることを確認済み。品質面で指摘なし（クリーンな追従修正）。
