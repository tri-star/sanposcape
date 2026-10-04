# Memory Index

- [プロジェクト規約の参照先](conventions_reference.md) — naming-convention.md / folder-structure.md の要点と場所
- [冪等化パターン(savepoint)](pattern_idempotent_savepoint.md) — begin_nested + IntegrityError 捕捉の元祖と踏襲箇所
- [計画ドキュメントの決定コード引用アンチパターン](antipattern_plan_decision_refs.md) — D6/Q3/B-D5 等の定義が計画書にしか無く追跡不能。src には2026-10時点で約30箇所残存、CIは.pyを検査しない
- [datetime query param の AwareDatetime 抜け](pattern_aware_datetime_query_params.md) — ボディはAwareDatetimeでもQueryは素のdatetimeになりがち（walksは修正済み）
- [select→delete→flushの同時2重DELETE](pattern-select-then-delete-race.md) — version_id_col無しはSAWarning止まりで誤成功。walksの警告昇格＋捕捉を踏襲、usersは意図的に未対応
- [締め切りの非対称（一部フェーズのみ／呼ぶ前だけ）](pattern_partial_deadline_guard.md) — 全I/Oフェーズが締め切り傘下か、1回の最悪時間が予算に入るか。確定処理の「呼ぶ前だけ」はADR-009で受容済み
- [「ちょうど1つ」不変条件の並行性](pattern-singleton-invariant-concurrency.md) — 部分一意インデックスで防げない「0になる」方向の直列化とrowcountを確認（SS-113で見逃し）
- [add_all後のループrefresh()はN+1](pattern_bulk_insert_refresh_n1.md) — 単一create()のrefreshは既存踏襲で問題なし、複数件ループが新規アンチパターン
- [機密ログ漏洩ガード回帰テストの慣習](pattern_secret_leak_log_guard_test.md) — test_secrets.pyのARN非漏洩assertが先例。ファイル移動時はcaplogのlogger名も確認
- [ハンドラー有無で分岐するロギング初期化のテスト](pattern_configure_logging_untestable_branch.md) — pytestがrootに常時ハンドラーを持つため退避が必要。configure_logging()は解消済み
- [commit後のORM属性アクセスで不要なSELECTが飛ぶ](pattern_expired_orm_attr_in_post_commit_log.md) — expire_on_commit=True下でcommit後にログでobj.idを参照すると再読込。commit前にローカル変数へ退避
- [TestClientはlifespan依存stateを使うならwith必須](pattern_testclient_lifespan_with_block.md) — R7規約。省略するなら理由をコメントに残す（test_main.py:151・api_docsの_client()が先例）
- [lock_timeoutガードの非対称パターン](pattern_lock_timeout_guard_asymmetry.md) — 一部のDB操作だけにタイムアウトガードを足すレビューで汎用的に確認すべき観点
