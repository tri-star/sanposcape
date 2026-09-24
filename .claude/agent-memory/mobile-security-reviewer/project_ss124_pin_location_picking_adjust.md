---
name: project_ss124_pin_location_picking_adjust
description: SS-124（地点選択画面/pins/pick-locationと登録画面での全画面オーバーレイ位置調整）のセキュリティレビュー要点
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-011-pin-location-picking-and-adjustment.md
---

SS-124（SS-88の拡張。ナビタブFAB→`/pins/pick-location`長押し→`/pins/new`、登録画面での
全画面オーバーレイ位置調整）をレビューした結果、Critical/High/Medium 0件。Low 1件
（FAB経由の座標が丸めずURLパラメータに乗る。既存`addPinAction.ts`と同じパターンの踏襲で
新規後退ではない）。

**確認した主な設計判断（良好点）**:
- 新ルート `/pins/pick-location` のガードは `/pins/new`（SS-88で確認済みの模範実装）と
  完全に同じパターン: `useAppConfig()` → `resolveFeatureGateDecision()` →
  pending=null描画・disabled=`Redirect href="/(tabs)"`（ハードコード）。新規フラグは
  作らず既存 `pin_registration` を流用（[[project_ss100_app_config_flags]] のfail-safe
  実装をそのまま再利用）。
- 座標検証は二重防御: `PinMapFullScreen.handlePick` が `toPickedCoordinate()`
  （`isValidCoordinate`でNaN/Infinity/範囲外を弾く）を通してから `onPick` を呼び、
  受け取り側 `/pins/new` の `parsePinLocationParams`（SS-88既存・無変更）でも再検証。
  `pinLocationAdjust.ts` の `resolveAdjustedLocation()` も同様に再検証。
- `/pins/pick-location` は未サインイン（ゲスト）でも到達可能（design decision D4）。
  認証必須判定は `/pins/new` の `PinSignInRequired` に一元化されたまま
  （フォーム全体非表示・`usePinPhotos`/`useSanpoMaps`は`enabled: isSignedIn`）。
  地点選択画面自体はサーバー通信をしないため実害なし。AuthGate（[[project_ss13_auth_gate]]）の
  `PUBLIC_ROOT_SEGMENTS`に`pins`は無いが、`canEnterProtectedRoutes`がguestを許可する
  （SS-57）ため到達できる。これは意図された設計で脆弱性ではない。
- 「位置を調整」ボタンのdisabled判定（`canAdjustPinLocation`）はクライアント側UI制御のみだが、
  `POST /pins`の`client_pin_id`冪等再送はサーバー側で内容を無視し既存ピンを返すため
  （ADR-010決定5）、バイパスされても実害なし。
- `useCurrentLocation`/`LocationPermissionNotice`の`features/walk`→`src/hooks`・
  `src/components/location`への昇格は`git mv`相当の純粋移動でロジック変更なし
  （`git diff`で確認）。
- 全画面地図オーバーレイ（`PinLocationAdjustOverlay`）はRNの`Modal`を使わず
  `position: absolute`のViewで実装（react-native-maps#3890/#4893のAndroid不具合回避）。
  Android バックは`useScreenBack({ onIntercept })`1本で処理し、Modal特有の
  `onRequestClose`競合を避けている。

**Why**: 「地図で座標を選んで既存の登録ルートへ渡す」という導線は今後も増えうる
（例: SS-118 登録済みピンの地図表示との統合、他の地点選択機能）。座標検証の二重防御
パターン（送信側`toPickedCoordinate`＋受信側ルートの`parsePinLocationParams`/
`isValidCoordinate`）と、新規ルートのフィーチャーフラグガードを既存実装からコピーする
やり方は再利用できる。

**How to apply**: 次に「地図で座標を選ぶ→別ルートへ渡す」系の新規ルートが増えたら、
(1) ガードが`/pins/new`/`/pins/pick-location`と同じ`resolveFeatureGateDecision`パターンか
(2) 座標の検証が送信側・受信側の両方にあるか (3) 認証必須判定が1箇所に集約されたままか
の3点を優先的に確認する。
