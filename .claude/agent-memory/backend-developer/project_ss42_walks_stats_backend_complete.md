---
name: project-ss42-walks-stats-backend-complete
description: SS-42 backend（GET /walks/stats: 週/月集計・連続日数）は実装完了。次はmobile側の実装
metadata:
  type: project
---

SS-42「mobile: 記録タブの週/月集計・連続日数・歩数を実装する」のうち、backend 側
（`GET /walks/stats` 新設 + ADR-003 SS-42 追補）は 2026-08-09 に実装完了した。

**実装内容:**
- `walks/stats.py`（新規）: 純粋関数（`to_jst_date` / `jst_day_start_utc` / `build_bucket_ranges` /
  `extend_streak`）+ 定数。DB・Pydanticに非依存。
- `walks/repository.py`: `aggregate_daily_for_user`（JST暦日ごとの集計、GROUP BY）と
  `list_walk_dates_desc`（streak走査用、`started_at DESC` の素の列順+LIMIT で早期打ち切り）を追加。
- `walks/service.py`: `WalkService.__init__` に `now: Callable[[], datetime]` を注入可能にした
  （`auth/service.py` の `AuthService` と同じ形）。`get_walk_stats` / `_count_streak_days` を追加。
- `walks/router.py`: `GET /stats` を `GET /{walk_id}` より前に宣言（ルーティング順序の制約）。
- ADR-003 に決定10/11/12を追加し、streak のサーバー保持判断（保留中だった）をクローズした。
- テスト 42 件追加（207→249 passed）。すべて固定アンカー（`STATS_ANCHOR_JST = 2026-03-15T12:00+09:00`）
  ベースで実行日時に非依存。

**次のステップ:** mobile 側の実装（`tmp/ss-42/mobile-plan.md`）。backend は openapi.yaml を再生成済み
（`operationId: get_walk_stats_walks_stats_get`）。

**2026-08-09 追記: ローカルレビュー指摘対応も完了。** streak 安全弁の break 条件を
`stats.py` の純粋関数 `should_continue_streak_scan` に集約し、安全弁が実際に効くことを
monkeypatch で検証するテストを追加（[[feedback-walks-stats-test-gotchas]] と同じ
monkeypatch対象namespaceの注意が適用される）。ADR-003 決定11 は「ちょうど3660日」ではなく
「チャンクサイズ未満のオーバーシュートを許容する概ねの上限」に文言修正。
`list_walk_dates_desc` に `id.desc()` の副ソートキーを追加。テストは 249→261 passed。
API契約変更なし（openapi.yaml diffなし）。詳細は `tmp/ss-42/session-recap.md` 参照。

関連: [[project-ss18-walks-backend-complete]] [[feedback-walks-stats-test-gotchas]]
