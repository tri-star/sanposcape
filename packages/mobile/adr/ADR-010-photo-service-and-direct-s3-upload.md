# ADR-010: 写真サービスは real/mock の2モード、アップロードは presigned POST で S3 直送

## 日付

2026-09-21

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

## 関連情報

- [ADR-006: 位置情報サービスは real/mock の2モード](./ADR-006-location-service-real-mock.md)
- [ADR-009（横断・backend）: ピンの写真ストレージとサムネイル](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
- [アーキテクチャガイドライン](../docs/architecture-guideline.md)
- [フォルダ構造](../docs/folder-structure.md)
