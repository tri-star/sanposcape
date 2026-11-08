# ADR-021: ピンの写真 — アップロード・保存・配信・容量

## 日付

2026-11-08（[ADR-009](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) から分割。決定の初出は 2026-09-21〜2026-10-26）

## ステータス

採用（backend・mobile 実装済み。dev・prod の写真バケットに結線済み）

## コンテキスト

ピンには写真を何枚でも付けられる。CloudFront + Lambda Function URL の構成（[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md)）は、
ボディを持つ POST/PUT に `x-amz-content-sha256` の計算をクライアントへ求め、Lambda の同期呼び出しのペイロードは 6 MB までなので、写真の本体を API 経由で送るのは現実的でない。
写真の送り方・保存の形・配り方・容量を本 ADR にまとめる。写真を消すときの扱いは [ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md)、
誰が写真を足し・消せるかは [ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md)。見出しの「旧 決定N」は凍結した ADR-009 の決定番号。

判断の最優先の基準は「**Lambda 実行ロールの境界（infra SS-107）が許す範囲で完結するか**」にした。境界が許す S3 のアクションは
`PutObject`/`GetObject`/`DeleteObject`/`AbortMultipartUpload` + `ListBucket` で、S3 イベント通知・非同期 invoke・SQS は使えない（使うには infra の別課題と承認が要る）。

mobile 側の判断（端末での縮小・EXIF の扱い・直送の実装）は [ADR-M-010](../../packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md)。

## 決定

### 決定1: 写真は presigned POST で先行アップロードし、ピンの作成・写真の追加が確定を兼ねる（旧 決定4）

1. mobile は `POST /pin-photo-uploads`（`content_type`, `byte_size`, `taken_at?`）で枠を取る。応答は presigned POST の `url`/`fields`。
2. mobile はフィールドをそのまま multipart で S3 の `staging/pins/<user_id>/<upload_id>.jpg` へ POST する（成功は 204）。
3. `POST /pins` または `POST /pins/{pin_id}/photos` に `photo_upload_ids` を含めると、**同じリクエストの中で確定する**（検証・メタデータの除去・サムネイルの生成・原本とサムネイルの Put・DB の書き込み）。
   ピンの作成と写真の紐付けが1リクエストで原子的に見え、「写真の欠けたピン」を見せない。

- **確定の順序は「全枚数の検証・除去・サムネイルの生成 → 原本とサムネイルの Put → DB commit → staging の best-effort 削除」**（`sanpo_maps/photos/photo_attacher.py`）。
  **DB が存在しない S3 オブジェクトを指す状態は作らない**（本 ADR 群の不変条件）。残りうるのは「DB から参照されない S3 オブジェクト」だけで、容量は DB の集計なので利用者の容量には影響しない（費用だけの問題）。
- **原本は staging から Copy せず、検証・除去したバイト列を常に Put する**（決定4）。
- **presigned POST を選んだ理由**: `content-length-range` で1枚の上限を S3 に強制できる（PUT は Content-Length の一致だけ）。`key` の完全一致の条件で、自分の prefix 以外に書けない。
- **S3 のキーはサーバーが決定的に組み立て、クライアントから受け取らない**（`sanpo_maps/photos/photo_keys.py` の純粋関数）:
  `staging/pins/<user_id>/<upload_id>.jpg` → 原本 `original/pins/<user_id>/<upload_id>.jpg`、サムネイル `thumb/pins/<user_id>/<upload_id>/512.jpg`。
  `user_id`（アップロード者）を prefix に入れるのは、アカウント削除のときに prefix ごと消せるようにするため（[ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md) 決定5）。キーは地図に依存しない。
- 枠が既にそのピンに紐付いていれば成功扱い（冪等な再送）、別のピンに紐付け済み・期限切れ・未完了なら 409 `photo_upload_not_ready`。紐付けの期限は既定6時間。

### 決定2: 写真の枚数はピン全体で無制限、1リクエストの確定は10枚まで（旧 決定5）

- 1つのピンの写真の総数に上限は無い（ユーザーの決定）。
- **`photo_upload_ids` は1リクエスト最大10件**（`PIN_PHOTOS_PER_REQUEST_MAX`、OpenAPI の `maxItems`）。Lambda 1024 MB・時間予算 20 秒・並列度3（`PIN_PHOTO_CONFIRM_CONCURRENCY`）で、
  1枚最悪 約1秒 × 10枚を約4秒に収める見積もり。11枚目以降は `POST /pins/{pin_id}/photos`（1〜10枚/回）で足す。
- Lambda の `MemorySize` を下げるときは `PIN_PHOTO_CONFIRM_CONCURRENCY` も見直す。

### 決定3: サムネイルは確定のときに backend が Pillow で同期生成する（旧 決定6）

- 原本から必ず作るので不一致が起きず、デコードが「JPEG として正しいことの検証」を兼ねる（マジックバイトの検査より強い）。
- **サイズは1つ（長辺 512px、JPEG 品質 80、約 30〜80KB）**。詳細表示は端末で長辺 2048px 程度に縮めた原本をそのまま使う。
- `pin_photos.width`/`height` はクライアントの申告ではなく、サーバーがデコードした実寸。
- `Image.draft()` でメモリ・CPU を抑え、デコードの前にヘッダーだけで画素数の上限（`PIN_PHOTO_MAX_PIXELS`、既定 4000万画素）を確かめる（decompression bomb の対策）。サムネイルは EXIF を含めずに作る。
- `pin_photos.thumbnail_*` と応答の `thumbnail` は null 許容（将来の非同期化で「生成待ち」を表せる。今はストレージの不調で null になりうる）。

### 決定4: 原本は確定のときにメタデータを無劣化で除去してから保存する（旧 決定35）

正規のアプリは端末で再エンコードして EXIF を落とすが、presigned POST の条件は Content-Type とサイズだけなので、サーバー側で担保する（招待で原本を他のメンバーに配る前提）。

- **方式**: `strip_jpeg_metadata()`（`sanpo_maps/photos/jpeg_metadata.py`。純粋関数）が JPEG のマーカーを SOI から EOI まで走査し、セグメント単位で残すか落とすかを決める。
  画像データはバイト列のまま写すので画素は変わらない（progressive・RST も辿る）。
- **残すもの（許可リスト）**: APP0（`JFIF`・`JFXX`）、APP2 の `ICC_PROFILE`、APP14 の `Adobe`、画像データのセグメント。
  **落とすもの**: APP1（Exif・XMP）、それ以外の APPn（IPTC・MPF・ベンダー固有）、JPGn、COM、EOI より後ろ（MPO の副画像）。許可リストにしたのは、未知の APPn のメタデータも既定で落とすため。
- **向き**: Exif の Orientation（2〜8）だけを、タグ1つの最小の Exif として書き戻す（落とすと端末の表示とサムネイルの向きが食い違う）。壊れた Exif からは読まない。
- **サムネイルは除去した後のバイト列から作る**（保存する原本がデコードできることの検証を兼ねる）。
- **原本は常に Put する**: staging は同じ枠の presigned POST（期限内）で上書きできるので、Copy すると検証した後に送り直された未検証のバイト列が原本に入る。
- **構造を辿れない JPEG は 409 `photo_upload_not_ready`**: SOI が無い・セグメント長が壊れている・EOI が無い・途中に SOI がある・予約のマーカー（0x02〜0xBF）がある・セグメントが **1024** を超える。
  MPO は副画像を落として1枚目の JPEG として通る。詰め物とエントロピー符号化データの読み飛ばしは `re` で線形時間に行う（1バイトずつのループは悪意ある入力で秒単位の CPU を使わされた）。
- `pin_photos.byte_size`（容量の計上）は保存した原本のサイズ。`PreparedPhoto` が原本のバイト列（最大 10 MiB × 10枚）を commit まで持つ（約 100 MiB の見積もり。実測していない）。
- 既存の原本には遡及しない。
- 却下: Pillow で再エンコードする（劣化する）／APP1 だけ落とす（IPTC・MPO の副画像の GPS が残る）／jpegtran で無劣化回転する（完全には無劣化にならず、ネイティブの依存が増える）。

### 決定5: 写真は撮影日時 `taken_at` を持つ。端末が EXIF から読んで申告する（旧 決定34）

- **端末が EXIF（`DateTimeOriginal` → `DateTimeDigitized`）から読んだ値を、枠の発行（`PinPhotoUploadCreate.taken_at`）で受け取る。** backend は撮影日時のために EXIF を読まない。
  **GPS は受け取らない**（端末が EXIF を残して送ると GPS も S3 に載るので、backend が原本から読む方式は成り立たない）。
- 任意・null 可・オフセット必須（`AwareDatetime | None`）。naive・日付だけは 422。範囲は瞬間（UTC 換算）で `[1900-01-01T00:00:00Z, 2100-01-01T00:00:00Z)`。
  範囲外を null に丸めない（mobile の不具合を隠さない）。「未来は 422」は付けない（端末の時計のずれで写真を落とさない）。
- **紐付けで枠から `pin_photos.taken_at` へ写し、枠の側は NULL に戻す**（`attached` の枠は写真を消した後も残るので、行動の履歴を残さない）。直す API は無い。
- `PinPhotoRead.taken_at` は必須キー・null 可で、すべての写真の応答に載る（UTC の瞬間。元のオフセットは保持しない）。既存の写真は null（mobile は `created_at` にフォールバック）。
- DB は `pin_photo_uploads.taken_at`・`pin_photos.taken_at`（`timestamptz NULL`。CHECK・インデックスなし）。**ログに出さない。**
- `PinPhotoUploadCreate` は `extra="forbid"` にしない（新旧の backend とアプリの組み合わせで未知のキーを無視する）。

### 決定6: 容量はアップロード者に計上し、原本だけを数える。上限は1人 10 GiB（旧 決定7・決定37）

- **上限は `PIN_PHOTO_USER_QUOTA_BYTES`（既定 10 GiB）**。walkshare の実績（1人で原本 5.7 GiB）と移行（約 2,000 枚・約 1 GiB を1人に計上）のため 1 GiB から上げた（SS-236）。
  1枚の上限は 10 MiB（presigned POST の `content-length-range`）。
- **アップロードした本人に計上する**（`pin_photos.uploaded_by_user_id`）。共有地図に他人が上げた写真で owner の容量が埋まらないようにする。**サムネイルは数えない。**
- 使用量 = 確定済みの `SUM(pin_photos.byte_size)` + 未使用で期限内の枠の申告値 `SUM(pin_photo_uploads.declared_byte_size)`（先食い）。
  枠の発行はユーザー単位の `pg_advisory_xact_lock(namespace, key)` で直列化する。確定のときは S3 上の**実サイズ**で再び確かめ、超えたら 409 `storage_quota_exceeded`。
- **未使用の枠の同時保有は既定30**（`PIN_PHOTO_MAX_PENDING_UPLOADS`）。超えたら 429（`Too many pending uploads`）。
- 上限まで使ったときの規模（1枚 300〜500 KB）は写真 約2.1万〜3.5万枚・S3 のキー 約4.3万〜7万。DB の削除・集計はローカルの PostgreSQL で写真7万枚でも1秒未満（容量の集計は約 6 ms）。
  削除のときの S3 の後始末が消し残す問題は [ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md) 決定4。
- 費用の概算（ap-southeast-1、2026-10 時点の公開価格。請求では未確認）: 上限まで使った1人の保存は 約 $0.27/月、10 GiB を全部1回見ると転送 約 $1.3。
- 却下: プランごとの上限・課金（範囲外）。

### 決定7: 未使用の枠は `DELETE /pin-photo-uploads/{upload_id}` で取り消せる（旧 決定11）

- mobile は先行アップロードした写真を紐付けの前に外せる。取り消せないと、枠が期限まで保有数と容量の予約を占有し、追加と削除を繰り返すと 429 で上げられなくなる。
- 対象は**本人の `pending` の枠だけ**。他人の・存在しない枠は 404、紐付け済みは 409。行は物理削除する（「取り消し済み」の状態は増やさない）。
- 行を `with_for_update()` でロックしてから状態を確かめる（確定の途中の枠を消して、確定と取り消しの両方が成功する競合を防ぐ）。staging は commit の後に best-effort で消す。

### 決定8: 写真の 409 は機械可読な `code` を持つ（旧 決定12）

- `POST /pins`・`POST /pins/{pin_id}/photos` の 409 は `code: "storage_quota_exceeded" | "photo_upload_not_ready"`（`PinConflictErrorRead`）。枠の発行の 409 にも同じ `code` が付く。
- `photo_upload_not_ready` は未完了・期限切れ・デコードできない・構造が壊れている・他人の枠を区別しない（存在を漏らさない）。mobile は容量の超過だけを区別して案内する。
- `detail` の固定文言は後方互換のため変えない。エラー応答の `code` の全体は [ADR-019](./ADR-019-sanpo-map-and-pin-data-model-and-api.md) 決定13。

### 決定9: 写真の URL は presigned GET で配り、ストレージの障害で閲覧 API を止めない（旧 決定16・決定18・SS-111 追補）

- `PinPhotoRead` は `thumbnail`（サムネイルの URL など）・`original_url: str | null`・`urls_expire_at`・`taken_at` を持つ。写真ごとの専用エンドポイントや 302 は作らない
  （グリッドから拡大するたびに往復が増え、一覧・詳細で URL をまとめて取れなくなる）。組み立ては `to_pin_photo_read()` だけ。
- サムネイルと原本の署名はそれぞれ独立に失敗を捕まえ、片方だけでも返す。**ストレージが未構成・障害でも閲覧 API は 200 を返し、URL を null にする**（ピンの名前・位置・タグは DB だけで返せる）。
- 原本を配るのは地図の member だけ（[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定3）。メタデータは決定4 で除去済み。

### 決定10: ストレージは `STORAGE_MODE=real|fake` と Unconfigured で切り替える（旧 決定8・2026-09-23 追補・SS-108 追補）

`AUTH_MODE`/`MAPS_MODE`/`FEATURE_FLAG_MODE` と同じ fail-safe（`ENV=local`/`test` 以外で `real` 以外を選ぶと起動しない）。

- **real**: boto3 で S3。`PIN_PHOTO_BUCKET_NAME` が空なら `UnconfiguredObjectStorage`（すべてのメソッドが `ObjectStorageUnavailableError`。AWS を呼ばない）。
  **写真を確定・発行する書き込み系の API は 503**、閲覧系は決定9、削除系は 503 にしない（[ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md) 決定1）。
- **fake**: presigned POST/GET の代わりに backend 自身の `/dev-storage/*`（fake のときだけ `include_in_schema=False` で include）を指す URL を発行する。
  URL はリクエストの `base_url` から組み立てる（エミュレータ・LAN の実機から届く）。署名は HMAC-SHA256（`AUTH_JWT_SECRET` を鍵に流用）。
  **保存先は `DEV_STORAGE_DIR`（ローカルは `storages/dev-storage`）のディスク**。空ならプロセス内メモリ（テストの既定）。容量で追い出さない。`..`・絶対パスを含むキーは拒む。
  MinIO / LocalStack は採らない（確かめたいのは presigned POST 互換の流れと表示で、fake で足りる）。
- **SAM の結線**: Api に `PIN_PHOTO_BUCKET_NAME`（SSM `pin_photos/bucket_name`）を渡し、実行ロールに `pin_photos/bucket_arn` で絞ったインライン Statement
  （`staging/*`・`original/*`・`thumb/*` に Put/Get/Delete、バケットに ListBucket）を付ける。`template.yaml` は dev/prod 共通（[deployment.md](../../packages/backend/docs/deployment.md) §12）。

### 決定11: 直送の失敗はサーバーから見えないので、端末と枠の発行のログで追う（旧 決定13 の一部・SS-88 追補）

- **直送が失敗しても AWS 側のどこにも痕跡が残らない**: backend は経路に居ない。CloudTrail の S3 データイベントは、呼び出し元を特定できないリクエスト（署名の失敗など）を記録しない。
  サーバーから見たいときは S3 サーバーアクセスログを一時的に有効にするのが唯一の手段（infra の作業）。**直送の可観測性は端末に持たせる**（ADR-M-010 決定10）。
- 枠の発行で `upload_id` と S3 のキーを INFO で残す（`PinPhotoUploadService`。どのオブジェクトが届くはずだったかを S3 と突き合わせるため）。**`form.fields` は絶対にログに出さない**（policy・署名・一時的な認証情報を含む）。
- backend のアクセスログ（1リクエスト1行）は、この調査で必要になって足した（旧 決定13）。現在の正本は [ADR-013](./ADR-013-observability-adot-application-signals.md)。

## 検討した選択肢

### サムネイルの作り方

- **クライアントが原本とサムネイルの両方を上げる**: backend の負荷はほぼ無いが、片方だけ成功しうる・不一致を検出できない・mobile の実装が増える。
- **backend が確定のときに同期生成する** ← 採用（決定3）。Lambda のメモリと時間を使い、Pillow で zip が 4〜5 MB 増える。
- **非同期生成（S3 イベント・別 Lambda）**: S3 イベント通知を使わない前提で、非同期 invoke・SQS は境界に無い。生成待ちの表示も要る。

### 写真の本体の送り方

- **API（CloudFront → Lambda）経由**: mobile は単純だが、`x-amz-content-sha256` の計算と 6 MB の上限に当たる。
- **presigned POST で S3 に直送** ← 採用（決定1）。mobile が2段階になる。

## 影響

### ポジティブな影響

- 写真が Lambda を経由しないので、ペイロードの上限・SigV4 のヘッダーの計算を避けられる。
- サムネイルの生成とメタデータの除去が、不正な画像（decompression bomb・JPEG 以外・壊れた構造）を確定の前に弾く。
- `STORAGE_MODE=fake` で、S3 が無くてもローカル・E2E で写真付きの流れを最後まで確かめられる。

### ネガティブな影響・トレードオフ

- 確定（デコード・除去・Put）が API Lambda のメモリ・CPU・時間を使う。
- 確定の途中の失敗で、DB から参照されない `original/`・`thumb/` が残りうる（費用だけ。回収は下の持ち越し）。

### 持ち越し

- **BK-3（Plane SS-218）**: 期限切れの `pending` の枠と、写真・ピンを消した後に残る `attached` の枠の行の削除、参照されない S3 オブジェクトの掃除（未実装）。
  枠の行が残ることはプライバシーポリシー 6・7 に書いた（ADR-012 の SS-210 追補）。
- **BK-8**: `GET /users/me/storage-usage`（使用量と上限の表示）。
- **BK-9**: サムネイルの非同期化（負荷・枚数の要件が変わったときだけ。`thumbnail_*` の null 許容で列を足さずに移れる）。
- `ObjectStorage.copy()` は呼び出し元が無くなった（口の削除は後続）。

## 関連情報

- 経緯の記録: [ADR-009（凍結）](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
- [ADR-019](./ADR-019-sanpo-map-and-pin-data-model-and-api.md)、[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md)、[ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md)
- [ADR-011](./ADR-011-sanpo-maps-module-structure.md)（`sanpo_maps/photos` の構成）、[ADR-013](./ADR-013-observability-adot-application-signals.md)（アクセスログ）
- [packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md) §12（写真バケットの結線）
- mobile: [ADR-M-010](../../packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md)（写真の扱い・直送）
- Plane: SS-88、SS-106/SS-107（infra）、SS-108、SS-116、SS-163、SS-236
