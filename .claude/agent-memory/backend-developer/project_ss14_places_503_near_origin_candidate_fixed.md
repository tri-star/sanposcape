---
name: project-ss14-places-503-near-origin-candidate-fixed
description: SS-33目視確認で見つけたSS-14由来の既存バグ(起点直近候補でPOST /explore/placesが丸ごと503)は修正済み。search_places()は候補ごとにtry/exceptするようになった
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

`POST /explore/places` の起点とほぼ同一地点に候補(例: 起点=駅の目の前で `station`
検索時のその駅自身)があると探索全体が503になるバグ(SS-14由来、SS-33由来ではない)は
2026-08-23 に修正済み(コミット `9e4719f`, ブランチ `tri-star/SS-33`)。

**原因だった連鎖**: 起点≒終点だとGoogleのcomputeRoutesが「1点だけのポリライン」を
200で返す → `integrations/google_maps/client.py` の `_load_route()` の
`if len(result.path) < 2: raise GoogleMapsUnavailableError()` が発火 →
`maps/service.py` の `search_places()` が候補ごとの try/except を持っておらず、
1件の失敗がループ外まで伝播して探索全体が503(`MapsUnavailableError`)になっていた。

**修正内容**:
- `MapsService.search_places()` のルート取得ループで `GoogleMapsUnavailableError` を
  候補ごとに捕捉し、その候補だけ除外して残りを200で返す。`GoogleMapsQuotaError`
  (429)はこのtryに含めず、従来どおり探索全体を打ち切る([[pattern_google_maps_sibling_exceptions]]
  と同じ「兄弟例外なので意図的に一緒に捕まえない」パターン)。
- スキップ時は `logger.warning` で候補index/件数のみログに残す(座標・APIキーは出さない)。
- `_load_route()` の1点未満チェック自体は変更せず、なぜ必要か(`WalkingRouteResponse.path`
  等の`min_length=2`契約を守るため)のコメントのみ追加。

**意図的に対応を見送った点**: `POST /explore/routes/walking` を起点≒終点の明示的な
destinationに対して呼んだ場合は503のまま(修正なし)。理由: 候補一覧ではなく単一
destinationへの明示リクエストのためフォールバック先が無い。周回側は既存の
`_resolve_loop()` フォールバックがあるので実質的に全滅時のみ503になる。ステータス
コードを422等に変える案も検討したが、API契約変更でありこのバグ修正のスコープ外と
判断した。将来mobile側でこの組み合わせが実際に起き得ると分かったら、
`search_places()` と同様に入力バリデーション(最小距離)で422にする方向を再検討する。

**テスト**: `packages/backend/src/sanposcape/maps/tests/test_service.py` に
`test_search_skips_candidate_with_unavailable_route_and_returns_remaining_candidates`
（回帰の本体）と `test_search_quota_error_during_route_fan_out_aborts_entire_search`
（429は引き続き全体を打ち切ることの固定）を追加。393 passed。
