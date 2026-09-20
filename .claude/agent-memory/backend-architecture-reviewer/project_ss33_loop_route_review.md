---
name: project_ss33_loop_route_review
description: SS-33周回ルートAPI(POST /explore/routes/loop)レビューの要点。検証スクリプトの結果がADR-007に未転記(しきい値暫定)が最大の留保事項
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
PR 作成時点で検証スクリプト（`scripts/loop_route_probe.py`）による検証セット全体の結果が
ADR-007 に未転記であること（レビュー時点では開発環境に `GOOGLE_MAPS_SERVER_API_KEY` が無く実API検証が
できなかった。以前このメモに「B7 未実施でマージ」と書いていたのはマージ前の誤記）。
2026-09-16 にエミュレータ上の実 API で1地点の周回採用と kill switch による同じ道フォールバックは確認されたが、
検証セット全体の評価の代わりにはならない。ADR-007（`docs/adr/ADR-007-loop-route-generation.md`）の
「移行・対応が必要な事項」に、この状況としきい値が暫定値であることが明記されている。

**2026-09-20 追補: 実API検証は実施済み。** 検証セット全体での同じ道フォールバック率は **69%** で
ADR-007 の目標に未達であることが判明し、フォローアップ課題 **SS-92**（`backend: 周回ルートの生成品質を
改善する`）が起票されている。**「検証が未実施」ではなく「検証済みで目標未達」が現状。**
しきい値定数は依然として暫定値のままだが、それは検証をしていないからではなく、改善が SS-92 待ちだから。

**How to apply:**
- SS-33 後続PRで `maps/loop_route.py` のしきい値定数（`MAX_DETOUR_RATIO` /
  `MAX_RETURN_OVERLAP_RATIO` / `MAX_RETURN_BACKTRACK_RATIO` / `MAX_VIA_SNAP_DISTANCE_METERS` /
  `MIN_WAYPOINT_OFFSET_METERS`）を扱う変更を見たら、SS-92 の一環かどうか・ADR-007 に実測値が
  転記されているかを確認する。フォールバック率の再計測を伴わずに値だけ変更していたら要指摘。
- レビュー時に Warning とした「`google_maps_route_deadline_seconds`（既定12秒・上限25秒）が
  `httpx.Client.request(timeout=...)` に生floatで渡り、`google_maps_connect_timeout_seconds`（既定3秒）を
  事実上上書きする（httpx は単一 float を connect/read/write/pool 全フェーズに適用する）」は、
  レビュー対応で修正済み。`packages/backend/src/sanposcape/integrations/google_maps/client.py` の
  `_request()` が `httpx.Timeout(timeout_seconds, connect=min(connect_timeout, timeout_seconds))` を渡す形になった。
  新規の deadline 系設定や httpx 呼び出しを追加するPRを見たら、生 float を渡していないか同じ論点を確認する。
- provider抽象の拡張パターン（既存メソッドに引数を足さず別メソッドを追加。
  `get_walking_route`→`get_walking_loop_route`）は「テスト用スタブが`**kwargs`で呼び出しを
  黙って吸収するリスクを避ける」という明確な理由で選ばれており、今後 provider インターフェースを
  拡張するPRのお手本になる。
- 関連: [[backend-layering-conventions]]、[[project_ss44_fake_maps_provider]]
  （`maps/tests/test_service.py`の`FakeProvider`と`integrations/google_maps/fake.py`の
  `FakeGoogleMapsProvider`の命名混同リスクは、SS-33でdocstringによる区別が追記され緩和された）
