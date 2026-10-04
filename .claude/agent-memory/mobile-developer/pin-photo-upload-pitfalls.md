---
name: pin-photo-upload-pitfalls
description: ピン写真のS3直送・枠上限吸収(pinSaveRunner)・幽霊枠カウンタを触るときの落とし穴とテスト手法。設計判断の正本はADR-M-010
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md
---

設計判断（presigned POST 直送を `customFetch` から分離する理由、`isAllowedUploadUrl` の許可規則、
未使用枠上限の吸収、429 を「待機に戻す」合図にする、attached 記録からの再開、削除失敗時の
「幽霊枠」カウンタ `heldGhostSlotsRef`）は
`packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md`（決定4・5、T11 追補）が正本。
HTTP 出口の全体像は [[mobile-http-layer]]。

## 落とし穴: バリデーション失敗を `unknown` エラーにしない

`isRetriablePinSaveError` は `unknown` を自動再試行の対象に含めている。恒久的に無効な入力
（`buildCreateRequest` が `null` を返す等）を `unknown` で表すと無限リトライになる。
**`ApiError(422)` で包んで `invalid_request`（再試行不可）に倒す。**
`createPin` / `addPinPhotos` 自体の失敗も `PinSaveError(stage, error, savedPinId)` で包み、UI が
`stage`（文言の出し分け）と `savedPinId`（ピンは保存済みか）を安定して得られるようにする
（`toPinSaveErrorCode` はラップを剥がして cause で分類する）。

## 落とし穴: 応答に含まれる ID を信用し、送った ID を信用しない

保存の再開判定は `createPin` / `addPinPhotos` の応答に含まれる実際に紐付いた ID で行う。
`client_pin_id` の冪等再送はサーバーが内容を無視して既存を返すため、応答喪失からの再開では
「送ったのに応答に無い」ケースが起こりうる。

## テスト手法: 模型サーバーで枠上限と応答喪失を再現する

`hooks/` はユニットテスト対象外（[[test-scope-hooks-components]]）なので、判定は `lib/` の純粋関数に
寄せ、`features/pin/lib/pinSaveRunner.test.ts` のような「模型サーバー」（JS クロージャで backend の
枠上限を再現し、保有数 >= 上限で 429 を投げる）で検証する。

- 35枚・100枚・「他所の未使用枠で埋まっている」ケースを固定する。
- `createPin` / `addPinPhotos` の「サーバーは成立・クライアントは例外」をフックで注入できるようにし、
  冪等な再開ロジックを固定する。
- 幽霊枠（削除 API が best-effort で失敗しうる資源）は、上限判定の純粋関数
  （`photoDraft.ts` の `nextPreuploadWork`）に `extraHeldSlots` を足すテストと、模型サーバーに
  `deleteUpload()` を実装して「発行→即削除」を繰り返しても `pending` が0に戻ることのテストで代替検証する。
  同種の「ローカル state からは消えるが backend 側の解放は非同期・失敗しうる」資源（予約・ロック等）でも
  同じ組み合わせ（カウンタ + 判定関数への加算パラメータ + 模型サーバー）を使う。

関連: [[effect-driven-queue-self-cancellation]]（同じ `usePinPhotos.ts` で起きたキューの自己キャンセル）
