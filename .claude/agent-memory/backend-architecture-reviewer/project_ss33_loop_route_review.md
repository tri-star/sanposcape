---
name: project_ss33_loop_route_review
description: 周回ルートAPIの決定・検証結果はADR-007が正本（フォールバック率69%で目標未達、改善はSS-92）。レビューで再利用する2つの観点（httpxへ生floatのtimeoutを渡す罠、provider拡張は別メソッド追加）。
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-007-loop-route-generation.md
---

`POST /explore/routes/loop`（SS-33）の判定しきい値・時間予算・実 API 検証結果（同じ道フォールバック率
69% で目標未達、しきい値は暫定値のまま、改善は SS-92）・セキュリティ上の Low（SEC-L1/L2）は
`docs/adr/ADR-007-loop-route-generation.md` に記録されている。

**How to apply:**
- `maps/loop_route.py` のしきい値定数（`MAX_DETOUR_RATIO` 等）を変える PR を見たら、SS-92 の一環か、
  フォールバック率の再計測と ADR-007 への転記を伴っているかを確認する。値だけの変更は要指摘。
- **httpx に生の float の timeout を渡さない**: `httpx.Client.request(timeout=12.0)` のような単一 float は
  connect/read/write/pool の全フェーズに適用され、短く保ちたい connect timeout を上書きする。
  `integrations/google_maps/client.py::_request()` は
  `httpx.Timeout(timeout_seconds, connect=min(connect_timeout, timeout_seconds))` を使う
  （ADR-007 決定4）。新しい deadline 系設定や httpx 呼び出しを追加する PR では同じ点を確認する。
- **provider 抽象は既存メソッドに引数を足さず別メソッドを追加する**
  （`get_walking_route` → `get_walking_loop_route`）。テスト用スタブが `**kwargs` で新しい引数を
  黙って吸収し、テストが意図せず通るのを避けるため。provider を拡張する PR のお手本。

関連: [[backend-layering-conventions]]、[[project_ss44_fake_maps_provider]]
