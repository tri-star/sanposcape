# ADR-010: 写真サービスは real/mock の2モード、アップロードは presigned POST で S3 直送

## 現在有効な決定（要約）

> 本文（`## 決定` 以降）は時系列の一次記録で、追補を重ねているため「今どれが有効か」が読み取りにくい。
> ここはその索引。齟齬があれば本文と実装が正。
> 最終更新: 2026-09-24（SS-88 実機不具合の追補）

| # | いま有効な決定 | 補足 |
|---|---|---|
| 1 | 写真の取得・加工は `services/photo/` の **real/mock 2モード**（`EXPO_PUBLIC_PHOTO_MODE`、既定 `real`）。ネイティブ依存は `photo.real.ts` に閉じる | 決定1・2 |
| 2 | アップロード前に端末で**長辺 2048px へ縮小 + JPEG 品質 0.7 で再エンコード**（EXIF も落ちる） | 決定3 |
| 3 | 1枚の上限の**正は枠発行応答の `max_byte_size`**。端末側の足切りは `PIN_PHOTO_MAX_BYTES_HARD_CAP`（50 MiB）の安全弁のみ | 決定3 + SS-88 追補 T9 |
| 4 | アップロードは **presigned POST で S3 に直送**し、`customFetch` は使わない。送信先は `isAllowedUploadUrl` で https と「backend と同一 origin の http」に限定 | 決定4 |
| 5 | **multipart のファイルパートは Blob 実装（`expo-file-system` の `File`）を渡す。RN 形式の `{ uri, name, type }` は使えない** | **SS-88 追補（2026-09-24）** |
| 6 | 先頭 `PIN_PHOTO_PREUPLOAD_MAX`（20枚）を先行アップロードし、残りは保存時に10枚ずつ処理。**429 はエラーにせず「待機に戻す」** | 決定5 |
| 7 | 未紐付け写真の削除時は `DELETE /pin-photo-uploads/{id}` を best-effort で呼び、失敗時は「幽霊枠」として数え続ける | SS-88 追補 T11 |
| 8 | 409 は機械可読な `code` で `quota_exceeded` / `photo_not_ready` を区別する | SS-88 追補 T15 |
| 9 | 写真付き E2E は当面できない（mock が実ファイルを返さないため） | 決定6 |
| 10 | 撮影/選択の UI に BottomSheet（RN `Modal`）は使わない | 決定7 |
| 11 | **直送の失敗は端末に痕跡を残す**（`logDiagnostic`。将来 Sentry に差し替える） | **SS-88 追補（2026-09-24）** |

## 日付

2026-09-21（初版）、2026-09-21 追補（PR #93 レビュー対応）、2026-09-24 追補（SS-88 実機不具合）

## ステータス

採用（SS-88）。データモデル・サーバー側の確定処理・サムネイル生成はルート
[ADR-009（backend）](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) を参照。
本 ADR は mobile 側（写真の取得・加工・アップロード）の判断を記録する。

## コンテキスト

SS-88 でピン登録機能を実装するにあたり、ユーザーが撮影/選択した写真を backend へ届ける経路が
新たに必要になった。制約は次のとおり。

- ユーザー決定: 1ピンあたりの写真枚数は**無制限**、1枚の上限は 10 MiB、ユーザー合計容量は 1 GiB。
- backend は写真の実体を保持せず、presigned POST（S3 直送）で受け取る（`POST /pin-photo-uploads`
  が発行する枠を使う）。1リクエスト（`POST /pins` / `POST /pins/{pin_id}/photos`）で紐付けられる
  写真は最大10枚（Lambda 29 秒予算のため）。
- backend は「未使用（未紐付け）の枠」の同時保有数に上限（既定30）を設けている（先食い・同時発行の
  競合を防ぐため）。上限を超える枠発行は 429 になる。
- mobile の HTTP 出口は `src/api/client.ts` の `customFetch`（backend 用、認証ヘッダー付与・
  401→refresh・一時障害再送）と `src/services/auth/authApi.ts`（backend 用、生 fetch）の2つのみ
  だった（`docs/architecture-guideline.md`）。S3 への直送はどちらの契約にも当てはまらない。
- ユニットテスト（Vitest, node 環境）は実機依存機能を real/mock で差し替える方針
  （`docs/architecture-guideline.md`「単体テスト」節）。

## 決定

1. **写真の取得（カメラ/ライブラリ）と加工（縮小・JPEG 再圧縮・サイズ取得）を
   `src/services/photo/` に置き、real/mock の2モード**（`EXPO_PUBLIC_PHOTO_MODE`、既定 `real`）とする。
   `dev` は作らない（[ADR-006](./ADR-006-location-service-real-mock.md) と同じ理由: 「本物に近いが
   実機に依存しない中間実装」に相当するものが無い。mock はダミー画像を返すだけで実ファイルの加工を
   伴わない）。
2. ライブラリは `expo-image-picker` + `expo-image-manipulator` + `expo-file-system`。
   ネイティブ依存を `photo.real.ts` の1ファイルに閉じる（`photo.mock.ts` は `react-native` も
   ネイティブモジュールも import しない）。
3. アップロード前に**必ず端末で縮小（長辺 2048px）・JPEG 品質 0.7 で再エンコード**する
   （`src/services/photo/photoResize.ts`）。理由: 通信量・待ち時間の削減、1人 1 GiB の容量を
   有効に使う、HEIC を backend が扱わずに済む、EXIF（撮影位置 GPS を含む）の除去
   （招待機能で他ユーザーに原本が見えるようになるため）。サーバーの1枚上限 10 MiB は安全弁で、
   **正は枠発行応答の `max_byte_size`**（設定値が変わってもアプリの更新が要らない）。
4. アップロードは backend が発行する presigned POST で **S3 に直送**し、`customFetch` を
   **意図的に使わない**（`src/features/pin/api/presignedPostUpload.ts`）。理由:
   （**SS-88 追補**: 初版の実装はファイルパートに RN 形式の `{ uri, name, type }` を渡していたが、
   Expo の `fetch` はこれを受け付けず実機・エミュレータで必ず失敗していた。現在は Blob 実装を
   渡す。下の「追補（2026-09-24）」の決定9を参照）
   - S3（backend 以外のオリジン）に `X-App-Authorization` を送らない。
   - `x-amz-content-sha256` は CloudFront(OAC) 用の契約で presigned POST には不要。
   - backend 用のベース URL・401→refresh・`transientRetry` はこの経路に当てはまらない。
   - API の一般的なボディサイズ上限（`RequestSizeLimitMiddleware`）を経由せずに済む。

   送信先の許可規則（`src/features/pin/lib/presignedPostForm.ts` の `isAllowedUploadUrl`）:
   - `https:` は常に許可（実 S3。バケットは DenyInsecureTransport）。
   - `http:` は **backend 自身も http のときに限り、backend と同じ origin（scheme/host/port）の
     http だけ**を許可する（backend の `STORAGE_MODE=fake` は `http://<リクエストされたホスト>/dev-storage/uploads`
     を `request.base_url` から組み立てて返すため、mobile が叩いている backend と必ず同じ origin
     になる。Android エミュレータの `10.0.2.2:8000` も `getApiBaseUrl()` の置換結果と一致する）。
   - それ以外（任意の http ホスト・不明なスキーム・パース不能）は拒否し、fetch しない。
5. 写真は選んだ直後に1枚ずつ直列で加工し（メモリ上で同時に展開する画像は1枚まで）、先頭
   `PIN_PHOTO_PREUPLOAD_MAX`（20枚。backend の未使用枠上限30より10少ない値）までを
   先行アップロードする。残りは「待機」として端末に保持し、保存時に
   「最大10枚を揃える（待機写真は枠発行・直送）→ 紐付けて枠を空ける」を全枚数まで繰り返す
   （`src/features/pin/lib/pinSaveRunner.ts`）。**429 はユーザー向けエラーにせず「待機に戻す」
   合図として扱う**。保存の再試行は「紐付け済み（attached）の記録から再開」する
   （`createPin`/`addPinPhotos` の応答に含まれる `upload_id` で実際に紐付いた分を判定し、
   送った ID を信用しない。`client_pin_id` の冪等再送は内容を無視して既存ピンを返すため）。
6. E2E（preview）は mock。写真付き E2E は、実ファイルを返す mock が用意できるまで別チケット。
7. 撮影/選択の選択 UI に BottomSheet（RN `Modal`）を使わない。RN の `Modal` を開いたまま OS の
   カメラ/写真ピッカーを出すと iOS で表示が競合するため、グリッド下の2つのボタン
   （`Button` variant="secondary"）で直接呼び出す。
8. データモデル・サーバー側の確定処理・サムネイル生成はルート ADR-009（backend）を参照する。
   MVP の登録画面はサムネイル（`thumbnail`）を使わずローカル画像を表示する。閲覧チケットで
   使うときは、画像キャッシュのキーを presigned URL 自体ではなく `photo.id` にする
   （URL は応答ごとに変わりうるため）。

## 検討した選択肢

- **presigned PUT**: 1枚の上限（`content-length-range`）を S3 側で強制できない（PUT は
  `Content-Length` の厳密一致のみ）。不採用。
- **API 経由のマルチパート**（backend が写真を中継）: backend の一般的なボディサイズ上限に
  抵触し、ハッシュ計算（`x-amz-content-sha256`）も余分にかかる。不採用。
- **端末で縮小しない**: 通信量・待ち時間・HEIC 対応・EXIF 除去のすべてを失う。不採用。
- **`expo-image-picker` の `quality` オプションだけで圧縮**: リサイズ（長辺基準の縮小）ができない。
  不採用（`expo-image-manipulator` と併用する）。
- **選んだ写真を全部先行アップロード**: backend の未使用枠上限（30）にすぐ達し 429 が頻発する。
  不採用。
- **31枚目以降はユーザーに「いったん保存」を求める**: ユーザーが明示した「写真は無制限」という
  要件に反する。不採用。
- **保存失敗時に手順全体をやり直す**: 枚数が多いと不要な枠発行が増える（初版で採用したが、
  実装中に「紐付け済みの記録から再開」に改めた）。

## 決定理由

- services 層の役割は「実機/ネイティブ依存を1箇所に閉じ、ユニットテストで差し替え可能にする」こと。
  写真の取得・加工はこの条件に当てはまるが、**アップロード（HTTP）は当てはまらない**
  （msw で十分テストできる）ため、`services/photo` には入れず `features/pin/api/` に置いた。
- 未使用枠の上限を mobile 側で吸収する設計にすることで、backend の設定値（30）を変えずに
  「写真無制限」というプロダクト要件を満たせる。ユーザーに待たせる操作を増やさない。

## 影響

### ポジティブな影響

- `features/pin` の判定ロジック（枠の上限管理・エラー分類・URL 許可）がすべて `lib/` の純粋関数で
  vitest からテストできる（`pinSaveRunner.test.ts` は模型サーバーで 35〜100 枚のシナリオを検証）。
- S3 直送により backend のボディサイズ制限・処理時間予算を圧迫しない。
- 端末側の縮小・EXIF 除去により、招待機能（将来）で原本を共有しても撮影位置が漏れない。

### ネガティブな影響・トレードオフ

- HTTP 出口が実質2箇所（`customFetch` / `authApi.ts` の生 fetch）から**backend への出口2箇所 +
  S3 直送**に増える。横断的な関心事（認証ヘッダー等）を足すときは S3 直送の経路に**入れてはいけない**
  ことを明記する必要がある（`docs/architecture-guideline.md` に追記）。
- 未使用枠の上限吸収ロジック（`pinSaveRunner.ts`）は状態遷移が多く複雑。ユニットテストへの依存度が
  高い（hooks/components はテストできないため、ロジックをすべて `lib/` に押し込む設計判断が前提）。
- 写真付き E2E は当面できない（mock が実ファイルを返さないため）。

### 移行・対応が必要な事項

- `expo-image-picker` / `expo-image-manipulator` / `expo-file-system` の追加により development
  build の作り直しが必要（[ADR-003](./ADR-003-development-build-and-dev-loop.md)）。
- `app.json` に `expo-image-picker` の config plugin（写真/カメラ権限文言）を追加。
- backend の `PIN_PHOTO_MAX_PENDING_UPLOADS` を 20 以下に下げる場合、mobile の
  `PIN_PHOTO_PREUPLOAD_MAX` / `BACKEND_PENDING_UPLOADS_MAX`（`src/features/pin/lib/pinLimits.ts`）
  の見直しが必要（下げても 429 経由で動作はするが、保存時の往復が増える）。

## 追補（2026-09-21, PR #93 レビュー対応）

`copilot-pull-request-reviewer` の指摘（`tmp/93-comments.md`）のうち、本 ADR の決定に関わる
4件をここに記録する。他の指摘（画面の薄いバグ修正: 保存エラー状態のリセット・
アンマウント後の dispatch 抑止・入力のスナップショット固定・座標パラメータの trim 等）は
決定そのものの変更ではないため追補しない。

- **T1（`redirect: "manual"` のコメント修正）**: 決定4のコメントが「防御している」と読める
  書き方だったため、「RN 実機では best-effort（`whatwg-fetch` が `options.redirect` を
  読まないため実効的でない）で、実機での実効的な防御は送信先 URL の検証
  （`isAllowedUploadUrl`）と S3 presigned POST の署名の制約（別オリジンへの3xxを返す
  正規の経路が無いこと）に依る」と明記する修正のみ行った。コードの挙動は変えていない。
- **T9（先行アップロードの1枚上限は枠発行応答が正）**: 決定3は元々「サーバーの1枚上限
  10 MiB は安全弁で、正は枠発行応答の `max_byte_size`」としていたが、
  `usePinPhotos.ts` の実装が先行アップロードの加工直後に固定 10 MiB でも足切りしており、
  ADR の決定と実装がずれていた（backend の上限を引き上げても枠発行前に失敗する）。
  実装をこの決定3に合わせ、端末側の足切りは `PIN_PHOTO_MAX_BYTES_HARD_CAP`（50 MiB。
  明らかに枠発行するだけ無駄な極端な値のみを弾く安全弁）に緩めた。ADR の決定文自体の変更は無い。
- **T11（削除した未紐付け写真の枠を解放する）**: 決定5に「保存フローが枠の上限を吸収する」
  ことは書いていたが、**アップロード後・紐付け前に削除した写真の枠**を backend 側で
  解放する手段が無かった（追加・削除を繰り返すと、どの枠も実際には使っていないのに
  未使用枠の保有上限に達して 429 になりうる。ルート ADR-009 決定11の背景と同じ）。
  backend が追加した `DELETE /pin-photo-uploads/{upload_id}` を `removePhoto` から
  best-effort で呼ぶようにし、失敗時は `usePinPhotos.ts` 内の「幽霊枠」カウンタ
  （`heldGhostSlotsRef`）で紐付け期限まで保有中として数え続ける（backend の会計とローカルの
  `PIN_PHOTO_PREUPLOAD_MAX` 判定がズレないようにするため）。
- **T15（409 の分類）**: 決定8（検討した選択肢）には明記していなかったが、
  MVP では「409 はすべて `photo_not_ready` として扱う」という制約があった
  （`pinSaveError.ts` の M-R7）。backend が追加した機械可読な `code`
  （`storage_quota_exceeded` / `photo_upload_not_ready`。ルート ADR-009 決定12）を
  `ApiError.body` 経由で読み、`quota_exceeded` と `photo_not_ready` を区別できるようにした。
  影響範囲を最小にするため、`src/api/client.ts`（非2xx 応答の JSON 本文を `ApiError.body` に
  保持する）と `src/api/apiError.ts`（`body` プロパティ・`getApiErrorCode()` ヘルパーの追加）
  のみ変更し、他の API のエラー処理（`message` の既定値・`isApiError` の判定）は変えていない。

## 追補（2026-09-24, SS-88 実機不具合の調査と修正）

TestFlight のビルド5（2026-09-22 配信）を iPhone 実機で試したところ、写真を選んだ直後の
先行アップロードが必ず「アップロードに失敗しました」で終わった。Android エミュレータでも同じ
（**iOS 固有ではなかった**）。原因・対処・再発防止をここに記録する。

### 決定9（追補）: multipart のファイルパートは Blob 実装を渡す。`{ uri, name, type }` は使えない

決定4の実装は、ファイルパートに React Native 独自の `{ uri, name, type }` を渡していた。
**Expo SDK 54+ は WinterCG の `fetch` を global に載せており、この形式を受け付けない。**
`node_modules/expo/src/winter/fetch/convertFormData.ts` に

```
 * `uri` is not supported for React Native's FormData.
```

と明記されており、`Blob` か `bytes()` を持つオブジェクト以外は
`Error: Unsupported FormDataPart implementation` で送信前に落ちる
（ADR-010 初版の「RN の `FormData`/`fetch` 実装（XHR ベースのポリフィル）はこの形を
ファイルパートとして解釈する」という前提は、Expo のランタイムでは成り立っていなかった）。

そこで **`PreparedPhoto` に `file`（`UploadFileBody`）を持たせ、`services/photo` が組み立てた
実体をそのまま直送に渡す**ことにした。`photo.real.ts` はサイズ計測のために既に
`new File(saved.uri)`（`expo-file-system`。`implements Blob` で `bytes()`/`name`/`type` を持つ）を
作っていたので、それを捨てずに返すだけで済む。`features/pin` 側で `uri` から組み立て直せないよう
**型（`UploadFileBody`）で塞ぎ**、理由を JSDoc に残した。

- `expo-file-system` の `File.upload()`（ネイティブの multipart）は**採らなかった**。
  ディスクからストリーミングできて魅力的だが、フォームフィールドと `file` の並び順が
  ネイティブ実装任せになり、**S3 の「`file` は最後」という制約を自前で保証できない**。
  加工後は実測 200KB 程度でメモリに載せても問題が無く、既存の `uploadToPresignedPost` と
  msw ベースのテストをそのまま使える利点を優先した。
- `XMLHttpRequest` を直接使う案（Expo は XHR を置き換えていないので `{ uri, ... }` が使える）も
  同様に不採用。`fetch` を捨てる分だけ実装が増える。
- 副作用として `uploadFileName(localId)` が使えなくなり削除した（`FormData.append` の第3引数の
  filename は Expo の実装では `value instanceof Blob` のときしか効かず、`expo-file-system` の
  `File` は構造的に Blob を満たすだけで instanceof を満たさない）。S3 の presigned POST は
  `key` フィールドで保存先が決まりファイル名を参照しないため実害は無い。

### 決定10（追補）: 直送の失敗は端末にログを残す

**この不具合は、当時の実装では原因を特定する手段が存在しなかった。** 直送は端末 → S3 で完結して
backend を通らないため CloudWatch Logs に何も出ず、リクエストが送信されていないので S3 の
サーバー側にも痕跡が無い（調査中に CloudTrail のデータイベントを有効化して再現したが、当然ながら
1件も記録されなかった）。さらに `photoUploadError.ts` はほぼ全ての失敗コードを同じ文言
（「アップロードに失敗しました」）へ潰すため、端末の表示からも区別が付かなかった。

`src/lib/diagnosticLog.ts` の `logDiagnostic()` / `describeError()` を唯一の出力口として、
次の3点を記録する。**将来 Sentry 等を入れるときはこの1ファイルの中身を差し替える**
（呼び出し側で `console.*` を直接使わないのはこのため）。

- 直送の直前（`pinPhotoTransfer.ts`）: `uploadId`・**フィールド名のみ**・サイズ・URI スキーム。
  `fields` の**値は絶対に出さない**（policy・署名・一時認証情報を含む）。
- 直送の失敗（`presignedPostUpload.ts`）: 「S3 に届かなかった」（例外の `name`/`message`）と
  「S3 が返した非 2xx」（status・`<Code>`・本文先頭）を別イベントに分ける。
- 分類後（`usePinPhotos.ts` / `pinSaveRunner.ts`）: `PhotoUploadErrorCode` と生の例外を対応付ける。
  `withTimeout` の60秒タイムアウトと RN の通信失敗はどちらも `network` に分類されるため、
  `errorName`/`errorMessage` が唯一の見分け方になる。

### 再発防止（テスト）

`presignedPostUpload.test.ts` はフォームの**キー順**（`key, policy, file`）だけを検証しており、
`{ uri, name, type }` を `as unknown as Blob` でキャストして渡していたため、**中身が送られて
いなくても通っていた**。「file パートに画像の中身がそのまま載る」ことを検証するテストを追加した。

### 検証

ローカル backend を `STORAGE_MODE=real` で dev の実バケットに向け、Android エミュレータで
写真付きピン登録を通した（2026-09-24）。`original/`（198171 バイト = `declared_bytes` と一致）と
`thumb/…/512.jpg` が作られ、`staging/` は確定後に削除されることまで確認した。
ルート ADR-009 の BK-1（`template.yaml` への S3 結線）の疎通確認も、これで実質的に取れている。

## 関連情報

- [ADR-006: 位置情報サービスは real/mock の2モード](./ADR-006-location-service-real-mock.md)
- [ADR-009（横断・backend）: ピンの写真ストレージとサムネイル](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
- [アーキテクチャガイドライン](../docs/architecture-guideline.md)
- [フォルダ構造](../docs/folder-structure.md)
