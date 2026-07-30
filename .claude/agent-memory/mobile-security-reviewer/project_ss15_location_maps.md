---
name: project_ss15_location_maps
description: SS-15（地図表示・探索候補、react-native-maps/expo-location導入）のセキュリティレビュー結果の要点
type: project
---

SS-15（ブランチ `tri-star/ss-15-claude`、2026-07-30 レビュー）で `src/services/location/`
（real/mock 切替、`src/services/auth` と同型）と `features/walk/{api,lib,hooks}` を新設し、
`react-native-maps` + `expo-location` を実導入した。レビュー結果は概ね良好:

- Google Maps キーは `app.config.ts` が `GOOGLE_MAPS_ANDROID_SDK_KEY`（`EXPO_PUBLIC_` 接頭辞なし）を
  `android.config.googleMaps.apiKey` にのみ注入。JS バンドルに焼き込まれない。backend の
  `GOOGLE_MAPS_SERVER_API_KEY` とは別キー運用（ADR-001 として明文化）。`.env`/`.env.example` に実キー混入なし。
- 探索リクエストの origin 座標は送信前に小数4桁（`roundCoordinate`, `placeSearchRequest.ts`）に丸められる
  （backend キャッシュキー精度に合わせる目的だが、副次的に精度過多送信も抑制）。
- `EXPO_PUBLIC_LOCATION_MODE` は `parseLocationMode()` が `"mock"` 完全一致以外すべて `"real"` にフォールバック
  （fail-safe。[[project_auth_stub_switch]] の教訓が活きている）。`eas.json` の `mock` 指定は `preview`
  プロファイルのみ、`production` には env 自体が無い。
- `customFetch`（`src/api/client.ts`）は Orval 契約 `{status,data,headers}` への追随のみで、
  トークン付与・401→refresh→1回リトライのロジックは変更なし。ログ出力にトークン/座標なし。
- `exploreError.ts` はステータスコードのみを見てユーザー文言に変換、サーバ内部情報の露出なし。
- 唯一の要検討点は認証ルートガードの不在（[[project_dev_only_routes_no_guard]] 参照。SS-15 由来ではなく既存の
  ギャップ）と、`WalkStartView.handleStartWalk` が生の現在地座標（丸めなし）を router params
  （`originLat`/`originLng`）で `(tabs)` へ渡している点（Low: SS-16 で消費される接続点として計画済みだが、
  精度をそのまま渡す必要は薄い）。

**Why:** 次回 SS-16（ルート提示・散歩開始）以降のレビューで、この時点の設計判断（座標丸め方針、location
サービスの real/mock 分離、customFetch 契約）が変わっていないか、また router params 経由の座標受け渡しが
そのまま `WalkActiveView` で消費され始めた際に精度・保存先を再確認すること。

**How to apply:** SS-16 のレビュー時にこのファイルを参照し、上記の座標丸め・キー分離・fail-safe env
パターンが崩れていないかを差分ベースで確認する。
