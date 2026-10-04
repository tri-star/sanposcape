---
name: pin-and-route-param-review-checklist
description: ピン登録・写真S3直送・ピン詳細/写真表示・地点選択と、動的ルート([param].tsx)のパラメータ検証のセキュリティレビュー観点(SS-20/SS-88/SS-118/SS-124のレビュー結果を統合)
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md
---

設計判断の正本: `packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md`（写真・S3 直送）、
`packages/mobile/adr/ADR-M-011-pin-location-picking-and-adjustment.md`（地点選択・位置調整）、
`packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md`（ピン詳細・画像キャッシュ）。
`/pins/map` と `/pins/pick-location` は SS-147 で削除済み（現存するのは `app/pins/new.tsx` と
`app/pins/[pinId]`）。

## 動的ルート・ルートパラメータ

- `[param].tsx` の ID は **route 側と API fetcher 側の2層で `isUuid()` 検証**する
  （`app/walk-history/[walkId].tsx` + `walkHistoryApi.ts` の `fetchWalkDetail`、
  `app/pins/[pinId]` + `pinReadApi.ts`）。Orval 生成の URL ビルダーはエスケープしないため、
  未検証だとディープリンク経由の `../` 注入で被害者のトークン付きリクエストを別エンドポイントへ
  誤送信させうる（SS-20 で High 指摘 → 解消済み。「walkId 検証は未実装」という前提で再指摘しない）。
- 座標パラメータは送る側（`toPickedCoordinate`）と受ける側（`parsePinLocationParams` /
  `isValidCoordinate`）の両方で検証されているか。座標を丸めずに URL params に載せるのは既知の Low。
- `/pins/[pinId]` はメンバーシップ検証を mobile では行わず backend（非メンバーに 404）が唯一の防衛線。
  mobile 側はサーバー応答に従うだけで妥当。

## 写真の送信（presigned POST 直送）

backend 以外への直送経路が増えたら次の3点を確認する:
1. 認証ヘッダー（`X-App-Authorization`）や `x-amz-content-sha256` を付けていないか（`customFetch` を通さない）。
2. 送信先 URL がホワイトリスト方式か（`isAllowedUploadUrl`: https は許可、http は backend と同一 origin のみ。
   origin は `URL.origin` ではなく protocol/hostname/port を個別比較 = RN 0.86 の URL ポリフィル対策）。
3. `redirect` オプション。`presignedPostUpload.ts` は `redirect: "manual"` を指定済みだが、RN 実機では
   `whatwg-fetch` が読まないため実効的な防御は 2. と S3 署名の制約に依る（ADR-M-010 T1 追補）。
   `redirect` だけで守られているという主張は通さない。

その他: EXIF 除去は二重（ピッカーの `exif: false` + `expo-image-manipulator` での再エンコード必須）。
`EXPO_PUBLIC_PHOTO_MODE` は未設定・不正値で `real` に倒れる（[[project_auth_stub_switch]]）。

## 写真の閲覧・キャッシュ

- 閲覧用 presigned GET URL も `isAllowedUploadUrl` を流用しているか（`pinRead.ts` の `toPinPhoto`）。
- 画像キャッシュキーは URL を含めず `pin-photo:<photo.id>:<thumb|original>` か。
- サインアウト時のキャッシュ消去の `registerSessionCleanup` は、**起動時に必ず読み込まれるモジュール**
  （`src/lib/imageCacheCleanup.ts`、`app/_layout.tsx` から副作用 import）で登録されているか。
  画面コンポーネント側で登録すると、一度も表示しないままのサインアウトで登録されず消えない
  （SS-118 で Medium 指摘 → 同 PR で解消）。

## ゲストとフィーチャーフラグ

- ゲストは `/pins/new` 等に到達できる（SS-57）。認証必須の判定がフォーム側
  （`PinSignInRequired`、`enabled: isSignedIn`）に1箇所で集約されたままか。ゲストの通信がゼロか。
- 新規ルートのフラグガードが既存と同じレシピか: `useAppConfig()` → `resolveFeatureGateDecision()` →
  pending は null 描画、disabled はハードコードの `Redirect href="/(tabs)"`（[[project_ss100_app_config_flags]]）。
- UI 側の disabled 判定（例: `canAdjustPinLocation`）だけに頼っていないか。`client_pin_id` の冪等再送は
  サーバーが内容を無視して既存を返すため、バイパスされても実害が無いことを確認する。
- 全画面地図オーバーレイは RN `Modal` を使わず absolute View + `useScreenBack({ onIntercept })`
  （react-native-maps の Android 不具合回避）。
