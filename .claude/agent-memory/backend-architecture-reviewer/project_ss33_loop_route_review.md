---
name: project_ss33_loop_route_review
description: SS-33周回ルートAPI(POST /explore/routes/loop)レビューの要点。B7実API検証未実施が最大の留保事項
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

SS-33（`POST /explore/routes/loop`）のバックエンドアーキテクチャレビュー（2026-09-15時点、
`tri-star/SS-33-claude` ブランチ）で確認した内容。

**Why:** レイヤー分離・provider抽象・キャッシュ/レート制限・例外境界はいずれも高品質で
指摘なし。唯一の重大な留保は、`maps/loop_route.py` の判定しきい値（`MAX_DETOUR_RATIO=1.4` 等）が
前回クローズ済みブランチ（PR #62、18試行のみ）のスパイク実測値に基づく暫定値のまま、
実API検証（バックエンド実装プランの「B7」ステップ）が未実施でマージされたこと。開発環境に
`GOOGLE_MAPS_SERVER_API_KEY` が無く検証できなかったためで、経緯は開発者側から引き継ぎとして
透明に記録されている（隠蔽ではない）。ADR-007（`docs/adr/ADR-007-loop-route-generation.md`）の
「移行・対応が必要な事項」にも「実API検証は本ADR執筆時点で未実施、しきい値は暫定値」と明記済み。

**How to apply:**
- SS-33 後続PRで `maps/loop_route.py` のしきい値定数（`MAX_DETOUR_RATIO` /
  `MAX_RETURN_OVERLAP_RATIO` / `MAX_RETURN_BACKTRACK_RATIO` / `MAX_VIA_SNAP_DISTANCE_METERS` /
  `MIN_WAYPOINT_OFFSET_METERS`）を扱う変更を見たら、実API検証が実施済みか・ADR-007に実測値が
  転記されているかを確認する。未実施のまま値だけ変更していたら要指摘。
- `google_maps_route_deadline_seconds`（既定12秒・上限25秒）は
  `packages/backend/src/sanposcape/integrations/google_maps/client.py` の `_request()` で
  `httpx.Client.request(timeout=...)` に生floatとして渡るため、`google_maps_connect_timeout_seconds`
  （既定3秒）を事実上上書きする（connect/read/write/pool全フェーズに同じ値が適用されるhttpxの
  仕様）。これはSS-33以前から `search_places` の `_remaining_seconds` 経路にも存在した既存
  パターンだが、SS-33で新設されたdeadlineの方が値が大きく影響範囲が広い。新規のdeadline系設定を
  追加するPRを見たら同じ論点を再確認する（Warning止まり、必須修正ではない）。
- provider抽象の拡張パターン（既存メソッドに引数を足さず別メソッドを追加。
  `get_walking_route`→`get_walking_loop_route`）は「テスト用スタブが`**kwargs`で呼び出しを
  黙って吸収するリスクを避ける」という明確な理由で選ばれており、今後 provider インターフェースを
  拡張するPRのお手本になる。
- 関連: [[backend-layering-conventions]]、[[project_ss44_fake_maps_provider]]
  （`maps/tests/test_service.py`の`FakeProvider`と`integrations/google_maps/fake.py`の
  `FakeGoogleMapsProvider`の命名混同リスクは、SS-33でdocstringによる区別が追記され緩和された）
