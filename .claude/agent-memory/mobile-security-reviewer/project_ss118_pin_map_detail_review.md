---
name: project_ss118_pin_map_detail_review
description: SS-118 登録済みピンの地図表示・ピン詳細画面（/pins/map, /pins/[pinId]）のセキュリティレビュー結果
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-012-pin-map-display-and-detail.md
  source_issue: SS-118
---

SS-118（登録済みピンの地図表示・ピン詳細画面。ピンタップで `/pins/[pinId]` へ直接 push）を
レビューした結果、Critical/High 指摘なし。Medium 1件（画像ディスクキャッシュのサインアウト時
消去が条件付き）。

**確認した主な設計判断（良好点）**:
- `app/pins/[pinId].tsx`: `pinId` を `isUuid()` で検証し、無効なら `PinDetailView` に `null` を渡す
  （`pinDetailState.ts` の `resolvePinDetailBodyState` が `invalid-id` を最優先で返す）。
  `pinReadApi.ts` の `fetchPinDetail`/`fetchPinPhotoPage` も呼び出し前に `isUuid` を再検証する
  多層防御（`app/walk-history/[walkId].tsx` と同型。[[project_ss20_walk_history_walkid_traversal]]）。
- 閲覧用 presigned GET URL（`toPinPhoto` in `pinRead.ts`）は SS-88 の `isAllowedUploadUrl` を
  そのまま流用（https常時許可／httpはapiBaseUrlと同一originのみ）。関数名・規則を変えず
  JSDocに用途追記のみ。URLのconsole出力は grep で0件。
- ゲスト時の通信抑止: `usePinDetail(pinId, { enabled: isSignedIn })` と
  `useRegisteredPins({ enabled: isSignedIn && flag })`（`useSanpoMaps`にも同じenabledが伝播）で
  TanStack Queryを無効化。散歩中の地図レイヤー（`RegisteredPinsMapLayer`）も
  `app/(tabs)/index.tsx` が `pinFeatureEnabled && isSignedIn` を注入。ゲストは通信ゼロ。
- 画像キャッシュキーは `pin-photo:<photo.id>:<thumb|original>`（URLを含めない。presigned URLが
  応答毎に変わるため）。photo.idはUUIDなのでユーザー間衝突は実質不可能。
- ルート画面ガード（feature flag `pin_registration` OFF → `/(tabs)` へ Redirect）は
  `/pins/new`・`/pins/pick-location` と同じレシピを踏襲（[[project_ss124_pin_location_picking_adjust]]）。

**Medium指摘（M-1）**: `PinPhotoImage.tsx` の `registerSessionCleanup(() => { Image.clearMemoryCache/
clearDiskCache })` はモジュール読み込み時に1回だけ登録される。ユーザーがそのプロセス起動中に
一度もピン詳細/ビューアを開かないままサインアウトすると、このcleanupは`cleanups` Setに
登録されておらずdisk cacheが消去されない。共有端末で「前セッションでピン写真を見た → 今回は
見ずにサインアウト → 別ユーザーがサインイン」という順序だと、前ユーザーの写真ファイルが
端末ディスクに残留する（同一cacheKeyが偶然再利用されない限りUI上には出ないが、端末への
物理/ファイルシステムアクセスで読める）。**同PR内で解消済み**: 登録を `src/lib/imageCacheCleanup.ts`
（`app/_layout.tsx` から副作用 import）へ移した（mobile ADR-012 D7）。

**Low/確認事項**:
- IDOR的な観点: `/pins/[pinId]` はUUID形式チェックのみで、そのピンが所属するsanpo_mapの
  メンバーシップ検証はmobile側で行わない（backend の `GET /pins/{id}` が403/404を返す前提）。
  ディープリンク（`sanposcape-dev://pins/<uuid>`）は任意のUUIDを外部から起動できるため、
  backend側の認可（他ユーザーの地図のピンへの不正アクセス拒否）が唯一の防衛線になる。
  mobile側の設計としては妥当（表示はサーバー応答に従うのみ）だが、backend側の認可実装は
  このレビューのスコープ外（backend `GET /pins/{id}` は非member に 404 を返す実装。SS-111）。
- `handleSelectPin`（Marker onPress）はバリデーションなしで`pinId`をrouter.pushするが、
  遷移先の`isUuid`検証で吸収されるため実害なし。

**Why**: presigned GET URLの許可判定・画像キャッシュキー設計・セッションクリア機構は
今後の写真閲覧系機能（SS-119編集・SS-120検索）でも再利用されるパターン。
**How to apply**: 次に写真を扱う新機能が増えたら、(1) `isAllowedUploadUrl`のGET URL流用を
崩していないか (2) キャッシュキーがphoto.id基準のままか (3) `registerSessionCleanup`の
登録箇所が「起動時に必ず読み込まれるモジュール」に寄せられたか、を優先確認する。
