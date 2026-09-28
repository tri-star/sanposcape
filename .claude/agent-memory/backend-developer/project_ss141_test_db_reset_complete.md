---
name: project_ss141_test_db_reset_complete
description: SS-141（backendテスト用DBのスキーマ作り直しをやめ、DELETEでのテーブルリセットに変更）は実装完了。conftest.pyのみの変更、テストコード・アプリコードは無変更
metadata:
  type: project
  scope: task-local
  source_issue: SS-141
---

SS-141（PR #103レビュー F-005 起点。約1,100件のテストのたびに `Base.metadata.create_all`/
`drop_all` していたのを、session スコープでのスキーマ作成1回 + 各テスト前のテーブルリセットに
変える）は2026-09-28に実装完了。

## 変更内容
- `packages/backend/src/sanposcape/conftest.py` のみ変更。`_setup_schema`（function・autouse）
  を廃止し、`_setup_test_db_schema`（session・autouse。開始時drop_all→create_all、終了時drop_all、
  いずれもlock_timeoutガード付き）と `_reset_tables`（function・autouse。**各テストの前**に
  全テーブルをDELETEで空にする）に置き換えた。
- テストコード本体・アプリケーションコードは無変更。
- TRUNCATEとDELETEを計測して比較し、DELETEを採用（TRUNCATE中央値47.24s→DELETE中央値32.81s、
  約31%短縮。誤差3%の閾値を大きく超えたため）。対象テーブルがテストのたびにほぼ空の状態で
  後始末が走るため、TRUNCATEのACCESS EXCLUSIVEロック取得コストがDELETEより相対的に高いと推測。
- 全体の実行時間は中央値で114.24s→30.52s（約73%短縮）。

## 判断・見送り事項
- 「テストの後」ではなく「テストの前」にリセットする方式を採用（前のテストのteardown失敗が
  後続に連鎖しない）。
- 「DBを触らなかったテストの後始末省略」最適化は見送り。`_reset_tables`自体のコストが全体の
  約6%（閾値の1割未満）だったため。
- 外側トランザクション+savepoint巻き戻し案は不採用（別セッション/スレッドを使う並行制御検証
  テストの意味が失われるため）。

## 記録場所
- 詳細な決定・計測結果・検討した選択肢: [ADR-B-001](../../../packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md)
  （ローカルレビュー対応で `docs/adr/ADR-011-...` から移動・改番済み。ADR単独で読める表現への
  修正、lock_timeoutガードのdrop_all/create_all側への追加も対応済み。2026-09-29）
- [[feedback_full_suite_intermittent_401]] にこのチケットとの関連を追記済み
  （全件実行での間欠的401の推測原因がこの変更で解消している可能性）。
