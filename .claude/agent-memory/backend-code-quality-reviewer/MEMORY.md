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
- [SS-33 周回ルートレビュー概要](project_ss33_loop_route_review.md) — spike実測値のコード転記が模範的。overlap比の境界テスト欠如などLow指摘のみ
- [GoogleMapsQuotaError/UnavailableErrorは兄弟例外](pattern_google_maps_sibling_exceptions.md) — 継承関係が無いのでexcept節を書く際は両方明示が必要
