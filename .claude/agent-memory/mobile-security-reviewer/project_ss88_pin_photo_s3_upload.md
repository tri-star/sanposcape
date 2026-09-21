---
name: project_ss88_pin_photo_s3_upload
description: SS-88 ピン登録機能（写真選択・EXIF除去・presigned POST S3直送）のセキュリティレビュー要点
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-010-photo-service-and-direct-s3-upload.md
---

SS-88（ピン登録: 写真つき）のmobile側は `src/features/pin/` + `src/services/photo/` に実装され、
presigned POST によるS3直送を `customFetch` から意図的に分離した「3経路目のHTTP出口」として
`docs/architecture-guideline.md` に明記済み。レビューは Critical/High 0件、Medium 1件（`M-1`）。

主な確認ポイント（次回同種レビューのチェックリスト代わりに使う）:
- `presignedPostUpload.ts`: 素の `fetch()` を使い認証ヘッダーを一切付与しない。ただし
  `redirect: "manual"` を指定しておらず、リダイレクト追従時に `isAllowedUploadUrl` の
  検証をすり抜けうる（Medium指摘 M-1、実害は低確率）。
- `presignedPostForm.ts` の `isAllowedUploadUrl()`: https は無条件許可、http は
  `apiBaseUrl` と同一 origin（scheme+host+port を個別比較。`URL.origin` は使わない＝
  RN 0.86 の URL ポリフィル不備を回避）のときだけ許可。fake storage(http)対応の
  ホワイトリスト実装として模範的。
- EXIF除去は二重防御: ピッカー呼び出し時 `exif: false` ＋ `expo-image-manipulator` での
  JPEG再エンコード必須（`prepared === null` なら転送不可）。生画像を直接送る経路なし。
- `EXPO_PUBLIC_PHOTO_MODE`: 未設定/不正値は `"real"` にフェイルセーフ（mockへは倒れない）。
  `eas.json` の staging/production は明示 `"real"`。[[project_auth_stub_switch]] の
  fail-closed方針と整合。
- ゲスト（未サインイン）は `/pins/new` に到達できる（SS-57 `canEnterProtectedRoutes` 方針）が、
  `PinRegisterView` が `isSignedIn===false` でフォーム全体を隠し `usePinPhotos`/`useSanpoMaps` も
  `enabled: isSignedIn` でゲート。写真の先行アップロードがサインイン前に走ることはない。
- ルートパラメータ（`/pins/new?latitude=&longitude=&clientWalkId=`）は
  `isValidCoordinate`/`isUuid` で厳格検証、`addPinPhotos` 呼び出し前にも `pinId` を
  `isUuid` で再検証（Orval生成URLビルダーがエスケープしない前提への防御）。
- エラー文言は固定テーブル（`pinSaveErrorMessage`/`photoUploadErrorMessage`）のみで、
  スタックトレース・生HTTPステータス・S3エラーコードのユーザー露出なし。

**Why**: presigned POST 直送のような「backendを経由しないHTTP出口」はプロジェクトとして
初出（ADR-010）。今後同種の直送経路（例: 他ファイルアップロード機能）が増えたときの
チェック観点として再利用できる。
**How to apply**: 新しい「backend以外への直送」経路が出てきたら、(1) 認証ヘッダーが
漏れていないか (2) URLホワイトリスト方式か (3) `redirect` オプションの明示 の3点を
必ず確認する。
