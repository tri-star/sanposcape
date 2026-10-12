---
name: pins-and-photos
description: mobile のピンと写真の落とし穴 — 検証失敗は 422 で包む、応答の ID で再開を判定、模型サーバーでテスト、必須フィールド追加で壊れるテスト、登録画面の地図選択を流用しない、EXIF は picker から、隠す状態はサーバーで除外
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-03-31
---

ピン・地図・写真の前提は ADR が正本: 用語と `PinRead` に role が無いことは ADR-009、S3 直送・先行アップロード・幽霊枠は ADR-M-010、
位置の選択と `client_pin_id` の冪等再送は ADR-M-011、表示・閲覧 URL の失効は ADR-M-012、地図一覧・詳細は ADR-M-014、編集・削除は ADR-M-017、アーカイブは ADR-M-021。

## 保存処理（`pinSaveRunner`）

- **恒久的に無効な入力を `unknown` で表さない。** `isRetriablePinSaveError` は `unknown` を自動再試行するので無限リトライになる。
  `ApiError(422)` で包んで `invalid_request`（再試行不可）にする。`createPin` / `addPinPhotos` の失敗は `PinSaveError(stage, error, savedPinId)` で包み、
  UI が段階（文言）と保存済みかを安定して得られるようにする。
- **再開の判定は、送った ID ではなく応答に含まれる ID で行う。** `client_pin_id` の冪等再送は内容を無視して既存を返すので、応答を失ってからの再開で「送ったのに応答に無い」が起こる。
- 既存ピンへの写真追加は `runPinSave` をそのまま使える（`getSavedPinId` が非 null なら `createPin` を飛ばして `addPinPhotos` だけ回す）。

## テストの手法: 模型サーバー

hooks はテストできないので、判定は `lib/` に寄せ、`features/pin/lib/pinSaveRunner.test.ts` のように JS のクロージャで backend の枠の上限を再現した模型サーバーで検証する。
- 35枚・100枚・「他所の未使用枠で埋まっている」を固定する。「サーバーは成立・クライアントは例外」をフックで注入し、冪等な再開を固定する。
- 削除が best-effort で失敗しうる資源（幽霊枠・予約・ロックなど）は、カウンタ + 判定関数への加算パラメータ（`nextPreuploadWork` の `extraHeldSlots`）+ 模型サーバーの `deleteUpload()` で検証する。

## 型を変えるときに一緒に直すもの

- `PinRead` / `PinListItemRead` に必須フィールドを足すと、型付きフィクスチャを持つテスト（`pinReadApi` / `pinEditApi` / `pinApi` / `pinRead` / `pinEditDraft` /
  `pinEditSync` / `pinEditSaveRunner`）が typecheck で壊れる。`PinPermissions` に項目を足すと `pinEditDraft.test` の `build()` と `pinEditSync.test` のリテラルが落ちる。プランの変更ファイルに含める。
- 登録画面の地図選択（`SanpoMapSelection` の `default` = `sanpo_map_id` を送らない・「最初の地図」の draft）は登録固有の意味を持つ。
  既存ピンの地図を扱う画面では流用せず、`SanpoMapChoicesState` を返す別の解決関数を作り、`SanpoMapSelector` だけ再利用する（SS-175）。

## 写真のメタデータ

S3 の原本には EXIF が無い（端末で再エンコードするため。ADR-M-010 決定3）。撮影日時は picker の `exif: true` から読む。
`expo-image-picker` 57 の Android は返すタグが固定リスト（`ImagePickerConstants.EXIF_TAGS`）で `OffsetTime*` が無い。iOS は Exif 辞書を平らに返し、GPS も `GPS*` キーで混ざる。

## 地図から隠す状態

アーカイブのように地図から隠す状態を足すときは、(1) 除外は `GET /pins` のサーバー側で行う（端末で捨てると1リクエスト200件の上限を隠れたピンが食う）、
(2) 解除のために戻る導線（地図詳細のピン一覧）からは除外しない（SS-173）。

Related: [[hooks-and-query]], [[planning-pitfalls]]
