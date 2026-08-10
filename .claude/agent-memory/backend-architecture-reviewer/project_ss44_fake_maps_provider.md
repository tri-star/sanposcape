---
name: project_ss44_fake_maps_provider
description: SS-44で確立された「mode + 許可リストfail-safe」パターンのMaps版と、fakeテストダブルの命名混同リスク
type: project
---

SS-44（`feat/ss-44-fake-maps-provider`, 2026-08時点でレビュー）で、`AUTH_MODE`（ADR-002
決定4）と同じ「`Literal["real", "fake"]` + `ENV not in (local, test)` の許可リストで
非real値を拒否する」fail-safeパターンが `Settings.maps_mode` にも横展開された。
`packages/backend/src/sanposcape/config.py` の `_validate_environment_settings`
（旧 `_validate_auth_settings` からリネーム）が唯一のバリデーション箇所で、
`auth_mode` と `maps_mode` の両方をこの1ブロックで検証する。

**Why:** 新しい fail-safe 項目が増えるたびに別バリデータを新設すると、許可リストが
複数箇所に分裂し「新しい env 値を追加したとき片方だけ更新される」事故（実際に
staging がこの罠を踏んだ既存インシデント、config.py のコメントに記録済み）を再発する。
リネームはこの1ブロック集約の規律を保つための布石。

**How to apply:**
- 今後3つ目の "mode" 系設定（例: 別の外部連携のfake化）が出てきたら、同じパターン
  （`_validate_environment_settings` に1行足す、新バリデータを作らない）を踏襲して
  いるか確認する。
- fake provider の実装（`integrations/google_maps/fake.py::FakeGoogleMapsProvider`）は
  `GoogleMapsProvider` プロトコルを構造的に満たす形（Protocol明示継承なし）で書かれて
  おり、`UnconfiguredGoogleMapsProvider` と同じ流儀。決定性（乱数・時刻・TTLキャッシュ
  不使用）が契約として docstring に明記されている。同種の fake を作る際はこの流儀を踏襲。
- **命名混同リスク**: `maps/tests/test_service.py` と `maps/tests/test_router.py` には
  それぞれ独立した手組みの `FakeProvider`（応答値を固定したい局所テスト用）が既に存在し、
  今回追加された「公式」の `FakeGoogleMapsProvider` と名前が紛らわしい。役割は別
  （`FakeProvider`は特定の数値でソート順/タイムアウト挙動を検証、`FakeGoogleMapsProvider`
  は幾何計算ベースで決定的候補を返す）だが、docstringでの区別が無いままなので、
  今後この周辺を触るPRでは両者の混同・意図しない統合を指摘ポイントとして持つ。
- 関連: [[backend-layering-conventions]]（`integrations/` の配置方針）、
  [[adr002-auth-shared-codepath]]（ADR-002決定4の元ネタ）
