---
name: explore-api-constraints
description: /explore/places の実挙動とコスト制約、mobile 側で守るべき呼び出し抑制ルール（M4 探索機能）
metadata:
  type: project
---

# 探索 API（`POST /explore/places`）の制約

**Why:** SS-14 で backend が実装済み。mobile の探索画面（SS-15/SS-16）を設計するとき、
知らずに書くと外部 API コストが跳ね上がる／不要なクライアント実装を作ってしまう。
**How to apply:** 探索まわりのプランでは必ずこの前提を書く。

一次資料: `packages/backend/openapi.yaml`、`packages/backend/src/sanposcape/maps/service.py`、
`packages/backend/src/sanposcape/integrations/google_maps/client.py`。

- 契約: `origin{latitude,longitude}` / `round_trip_duration_minutes`(10..120, **multipleOf 5**) /
  `categories`(ExploreCategory 1..6) / `limit`(1..20, 既定20)。要 Bearer。
  エラー 401 / 413 / 429 / 503 / 422（**いずれも本文なし＝status だけで文言を出し分ける**）。
- `ExploreCategory` = `convenience_store|supermarket|retail|facility|park|station`。
- **候補は backend が「往復時間超過を除外」＋「往復時間昇順→距離昇順でソート」済みで返す**
  → mobile 側にクライアント絞り込み・ソートは不要。
- **1 探索 = Places 1回 + 候補ごとの Routes 呼び出し（最大20回）**。レート上限は
  ユーザー/IP ごと既定 30req/60s（超過 429）。→ mobile は
  「スライダーは指を離した時だけ」「カテゴリはシート確定時だけ」再探索する設計が必須。
- provider キャッシュキーは `places:{lat:.4f}:{lng:.4f}:{sorted(categories)}:{limit}`（TTL既定300秒）
  → mobile も **origin を小数4桁に丸め、categories をソートして送る**とヒット率が上がる。
- **`GOOGLE_MAPS_SERVER_API_KEY` 未設定の backend は `UnconfiguredGoogleMapsProvider` で常に 503**。
  ローカル/CI で候補0件・503 になるのは正常。E2E で候補件数に依存する assert を書かないこと。
