---
name: feedback-httpx-timeout-mocktransport
description: httpxのtimeout=に単一floatを渡すとconnectにも同じ値が効く。適用されたtimeoutはMockTransportのhandlerでrequest.extensions["timeout"]を読めばテストで検証できる
metadata:
  type: feedback
  scope: durable
---

httpx は `timeout=` に単一の `float` を渡すと、connect / read / write / pool の全フェーズに同じ値を適用する。
長い上限（例: 周回ルートの `route_deadline_seconds` 最大25秒）をそのまま渡すと、短く保ちたい connect タイムアウト
（`google_maps_connect_timeout_seconds` 既定3秒）まで上書きされ、接続詰まり時に長く待ってしまう。

**Why:** SS-33 のアーキテクチャレビューで見つかった。`integrations/google_maps/client.py` の `_request()` は
`httpx.Timeout(timeout_seconds, connect=min(connect_timeout_seconds, timeout_seconds))` を渡す形に直した
（`docs/adr/ADR-007-loop-route-generation.md` 決定4）。

**How to apply:**
- httpx に呼び出しごとの timeout を渡すときは、単一の float ではなく `httpx.Timeout(...)` でフェーズを分ける。
- 実際に適用された timeout は、`httpx.MockTransport` の handler 内で `request.extensions["timeout"]` を読むと
  フェーズ別の dict（`connect` / `read` / `write` / `pool`）で取れる。これを assert すれば、実通信なしで回帰テストにできる。
