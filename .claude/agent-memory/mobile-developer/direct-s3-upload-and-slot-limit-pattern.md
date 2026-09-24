---
name: direct-s3-upload-and-slot-limit-pattern
description: SS-88で確立したpresigned POSTでのS3直送パターンと、backendの未使用アップロード枠上限をmobile側で吸収するpinSaveRunnerの設計
metadata:
  type: reference
  scope: durable
---

## S3直送はcustomFetchを通さない3つ目のHTTP出口

[[mobile-two-http-exits]] の2箇所（`client.ts`の`customFetch` / `authApi.ts`の生fetch）に加えて、
SS-88で写真の presigned POST 直送（`features/pin/api/presignedPostUpload.ts`）が3つ目の出口として
追加された。**意図的に`customFetch`を使わない**理由: (1) backend以外のオリジン(S3)に
`X-App-Authorization`を送らない (2) `x-amz-content-sha256`はCloudFront(OAC)用の契約でpresigned
POSTには不要 (3) backend用のベースURL・401→refresh・`transientRetry`はこの経路に当てはまらない。
横断的な送信ヘッダーを追加するとき、この経路には**入れてはいけない**（`docs/architecture-guideline.md`
に明記済み）。

送信先URLの許可判定（`features/pin/lib/presignedPostForm.ts`の`isAllowedUploadUrl`）:
- `https:`は常に許可。`http:`は**backend自身もhttpのときに限り、backendと同じorigin**（scheme/host/port）
  のhttpだけ許可する（backendの`STORAGE_MODE=fake`は`request.base_url`由来のURLを返すため）。
- origin比較は`new URL()`の`protocol`/`hostname`/`port`を個別比較する（RN 0.86のURLポリフィルは
  `origin`プロパティの実装が不完全な場合があるため）。

## 未使用アップロード枠の上限をmobile側で吸収する設計（pinSaveRunner）

backendが「未紐付けの枠」の同時保有数に上限（例: 30）を設けている場合、mobileは以下の設計で
「枚数無制限」という要件を満たしつつ429を表に出さずに済ませられる:

1. 先行アップロードは backend 上限より小さい値（余裕分を残す。SS-88では30-10=20）までに自制する。
2. 保存時は「1リクエストで紐付けられる上限（例: 10枚）を揃える → 紐付けて枠を空ける」を全枚数分
   繰り返す。揃える際、`waiting`/`failed`の写真は都度枠発行・直送し、`uploaded`済みはそのまま数える。
3. **429はエラーではなく「待機に戻す」合図として扱う**。揃える処理を打ち切り、それまでに揃った分
   （0枚もありうる）だけ先に紐付けて枠を空けてから続きを再試行する。
4. 「手元に空けられる枠が無い」（0枚のまま429を受け、かつピン作成済み）ときだけ真のエラー
   （`PhotoSlotsBusyError`）にする。これが唯一の停止条件で、無限ループを避ける。
5. 保存の再試行は「手順全体のやり直し」ではなく「紐付け済み（attached）の記録から再開」にする。
   `createPin`/`addPinPhotos`の応答に含まれる実際に紐付いたIDのリストを見て判定し、
   **こちらから送ったIDを信用しない**（`client_pin_id`の冪等再送は内容を無視して既存を返す契約
   のため、応答喪失からの再開では「今回送ったのに応答に無い」ケースが起こりうる）。

## PinSaveError: write系の失敗もPinSaveErrorで包む

写真アップロード由来の例外だけでなく、`createPin`/`addPinPhotos`自体の失敗（ApiError/TypeError等）
も`PinSaveError(stage, error, savedPinId)`で包んで投げる。UIが`stage`（create/add_photos。文言の
出し分けに使う）と`savedPinId`（「ピンは保存済み」の判定）を安定して得るために必要
（`toPinSaveErrorCode`は`PinSaveError`でラップされていてもcauseを剥がして分類する）。

**落とし穴**: バリデーション失敗（`buildCreateRequest`が`null`を返す等）を`unknown`エラーコード
で表現しない。`isRetriablePinSaveError`の自動再試行対象に`unknown`を含めている設計だと、
恒久的に無効な入力が無限リトライを起こす。`ApiError(422)`でラップして`invalid_request`
（再試行不可）に倒すこと。

## テスト: 模型サーバーで枠上限を再現する

`pinSaveRunner.test.ts`のように、backendの枠上限をJSのクロージャで再現した「模型サーバー」
（`transferPhoto`が保有数>=上限で429を投げる）を作り、35枚・100枚・「他所の未使用枠で埋まっている」
ケースをvitestで検証する。`createPin`/`addPinPhotos`の「応答喪失（サーバー側は処理成立・
クライアントは例外）」もフックで注入できるようにしておくと、冪等な再開ロジックを固定できる。

関連: [[services-real-dev-mock-pattern]], [[mobile-two-http-exits]], [[tanstack-mutation-pattern]]
