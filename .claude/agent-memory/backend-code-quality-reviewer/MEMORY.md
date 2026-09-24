# Memory Index

- [プロジェクト規約の参照先](conventions_reference.md) — naming-convention.md / folder-structure.md の要点と場所
- [冪等化パターン(savepoint)](pattern_idempotent_savepoint.md) — begin_nested + IntegrityError 捕捉の元祖と踏襲箇所
- [計画ドキュメントの決定コード引用アンチパターン](antipattern_plan_decision_refs.md) — D1/Q3/B-3 等がgitignore対象のtmp/にしかなく追跡不能
- [datetime query param の AwareDatetime 抜け](pattern_aware_datetime_query_params.md) — リクエストボディはAwareDatetime必須だがQueryパラメータは素のdatetimeになりがち
- [SS-18 walksドメインレビュー概要](project_ss18_walks_review.md) — 実装の全体像と主要な設計判断（D1〜D11）
- [SS-42 GET /walks/statsレビュー概要](project_ss42_walks_stats_review.md) — streak安全弁のソフトキャップ未検証、mobile-plan 3.6.2の6条件テスト状況
- [SS-44 fake maps providerの経緯](project_ss44_fake_maps_provider.md) — MAPS_MODE=fake追加の背景と意図的なスコープ外事項（mobile-e2e.ymlのTODOは指摘しない）
- [select→delete→flushのStaleDataErrorレース](pattern_select_then_delete_race.md) — users/walks repository.delete()共通の未捕捉例外、新規delete()実装時に必ず確認
- [SS-53 walks削除APIレビュー概要](project_ss53_walks_delete_review.md) — ADR-003決定13の背景。StaleDataErrorレースは対応済み確認(2026-08-13)。PR47フォローアップ(413統一/docstring)も指摘なし
- [確定処理の締め切りが最初のフェーズにしか掛からない](pattern_partial_deadline_guard.md) — SS-88 photo_attacher: prepare()はdeadline付き、commit()/cleanup_stagingは無期限
- [add_all後のループrefresh()はN+1](pattern_bulk_insert_refresh_n1.md) — SS-88 pins/repository.py。単一create()のrefreshは既存踏襲で問題なし、複数件ループが新規アンチパターン
- [機密ログ漏洩ガード回帰テストの慣習](pattern_secret_leak_log_guard_test.md) — test_secrets.pyのARN非漏洩assertが先例。新規ログ追加時は同種テストの有無を確認
- [configure_logging()のadd-handler分岐が事実上テスト不能](pattern_configure_logging_untestable_branch.md) — pytestがroot loggerに常時ハンドラーを持つため、ローカル/uvicorn向けの主分岐が未検証
- [commit後のORM属性アクセスで不要なSELECTが飛ぶ](pattern_expired_orm_attr_in_post_commit_log.md) — expire_on_commit=True下でcommit後にpin.id/current_user.idをログ参照すると再読込が発生。create_upload/delete_uploadの回避パターンと対比
