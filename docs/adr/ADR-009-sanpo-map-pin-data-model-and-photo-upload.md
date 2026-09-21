# ADR-009: 地図（SanpoMap）とピン（Pin）のデータモデル、写真の先行アップロードとサムネイル生成

## 日付

2026-09-21（初版、SS-88）

## ステータス

採用（backend・mobile 実装済み）。`template.yaml` への S3 結線（BK-1）は infra 側
（SS-106/107）の dev apply 待ちで未着手。

## コンテキスト

### 解こうとしている問題

散歩アプリ sanposcape に「散歩中に見つけた場所を、名前・メモ・タグ・写真つきで自分の地図に
登録する」機能（task 本文の「ピン登録」）を追加する。要件を分解すると次の3つの設計課題がある。

1. **登録地点の入れ物（地図）とアクセス権限のデータモデル**。将来、地図を他人と共有する
   （招待・共同編集）ことを見込みつつ、MVP では自分の地図に自分で登録する範囲に留める。
2. **写真のアップロード方式**。CloudFront + Lambda Function URL 構成
   （[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md)）は
   ボディを持つ POST/PUT に `x-amz-content-sha256` の計算をクライアントへ要求するうえ、
   Lambda の同期呼び出しペイロード上限（6 MB）もあるため、写真本体を API 経由で送るのは
   現実的でない。
3. **既存の「スポット」という語の衝突**。`maps/` ドメインには Google Maps 由来の散歩目的地
   候補を指す `SpotCandidate`（および `GET/POST /spots` という認証なしのサンプル実装）が
   既にあり、今回追加する「ユーザーが自由に登録する地点」と同じ語を使うと意味が二重になる。

### 前提となる決定（既存 ADR・確定事項）

- [ADR-002](./ADR-002-auth-google-signin-and-stub-strategy.md) 決定4: `get_current_user`
  が認証の choke point。モード切替（`AUTH_MODE` 等）は許可リスト方式の fail-safe
  （`ENV=local`/`test` 以外で non-real を選ぶと起動失敗）。
- [ADR-003](./ADR-003-walk-record-persistence-and-history-api.md) 決定3・決定6・決定7:
  `client_*_id` による冪等作成（新規 201・再送 200）、他人のリソースは 404（存在を漏らさない）、
  `User` に `relationship()` を張らず `ON DELETE CASCADE` に委ねる。
- [ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) 決定9:
  マイグレーションは手動・デプロイ後に実行する（expand → contract の間、新コードが旧スキーマで
  動く前提を置く）。
- [ADR-008](./ADR-008-deploy-release-separation.md): フィーチャーフラグ基盤（AWS AppConfig）。
  未公開機能はフラグ OFF のまま本番へデプロイしてよい。フラグの登録簿はコード
  （`core/feature_flags.py`）が所有し、値は AppConfig が持つ。
- infra 側（`sanposcape-infra`）が SS-106（写真用 S3 バケット, `live/platform`）と
  SS-107（Lambda 実行ロールの境界に S3 アクションを追加, `live/account`）に着手済み。
  2026-09-21 時点で両方とも PR 作成・CI 通過済みだが **dev への apply はまだ**。
  境界が許可する S3 アクションは `PutObject`/`GetObject`/`DeleteObject`/
  `AbortMultipartUpload`（オブジェクト単位）+ `ListBucket`（バケット単位）に限られる。

### ユーザー決定（この ADR に先行して確定済み）

- **命名は「ピン（Pin）」に統一する**。「スポット」は既存の `SpotCandidate`
  （散歩の目的地候補）の意味に限定し、ユーザーが自由に登録する地点は Pin と呼ぶ
  （コード・API・DB・UI すべて）。
- **1つのピンの写真枚数は無制限**（1リクエストで確定できる枚数だけ Lambda の時間予算のため
  10枚に制限する）。
- **1枚あたりの上限は 10 MiB**、**ユーザー合計の上限は 1 GiB**（いずれも設定値）。
- **アップロード時にサムネイルを作る**（一覧・詳細で原本を常に配らないため）。

## 決定

### 決定1: 用語 — ピン（Pin）/ 地図（SanpoMap）/ スポット（SpotCandidate に限定）

| 概念 | コード / DB | API |
|---|---|---|
| 地図（ピンの入れ物） | `SanpoMap` / `sanpo_maps` / `sanpo_map_members` | `/sanpo-maps`、`sanpo_map_id` |
| 登録地点 | `Pin` / `pins` | `/pins`、`client_pin_id` |
| ピンの写真 | `PinPhoto` / `pin_photos` | `photos` |
| 写真のアップロード枠 | `PinPhotoUpload` / `pin_photo_uploads` | `/pin-photo-uploads`、`upload_id` |
| ピンのタグ | `PinTag` / `pin_tags` | `tags` |
| フィーチャーフラグ | `pin_registration` | `/app-config` の `flags.pin_registration` |
| S3 キー | `staging/pins/…` / `original/pins/…` / `thumb/pins/…` | mobile はキーを解釈しない |

`Map`（地図）単体・`Spot`（登録地点）単体という語は使わない。前者は `maps/` ドメイン
（探索・経路算出）と、後者は `SpotCandidate`（散歩目的地候補）と衝突するため。

既存のサンプル API `GET/POST /spots`（`spots/models.py` の `Spot`）は本 PR で
ドメインごと削除した。配布済みの mobile ビルドは Orval 生成物を一度も使っておらず
（`client.test.ts` は手書き URL + msw）、削除の相手（configured client）が存在しないため、
ADR-008 決定7（expand → contract）の例外として直接削除している。

### 決定2: 地図とピンは N:1、権限は `sanpo_map_members` の role で判定する

- **ピンはちょうど1つの地図に属する**（多対多にしない）。同じ場所を2つの地図に入れたい
  場合は別のピンになる。多対多だと「どの地図の owner が削除できるか」の判定が複雑になる。
- 権限は常に `sanpo_map_members`（`sanpo_map_id`, `user_id`, `role`）の行で判定する。
  **owner も member 行を持つ**（`role="owner"`）。招待機能（別チケット BK-7）は
  `role="editor"` の行を足すだけで済み、権限判定のコードパスを増やさずに拡張できる。
- 作成者カラム（`pins.created_by_user_id` / `pin_photos.uploaded_by_user_id` /
  `pin_tags.created_by_user_id`）を持ち、「自分が作成したものは編集・削除できる」
  「owner は全部できる」という将来の権限マトリクスの材料にする。実際の編集・削除 API
  は別チケット（BK-5）で実装する。

権限マトリクス（MVP で実装済みなのは `can_add_pin` / `can_add_pin_photo` のみ。他は
将来の編集・削除・タグ付与チケットで実装する行を示す予定表）:

| 操作 | owner | editor（招待, 未実装） |
|---|---|---|
| ピンの追加 | ○ | ○ |
| ピンへの写真追加 | ○ | ○（招待ユーザーが owner のピンに写真を足せる） |
| ピンの編集（名前・メモ） | ○ | 作成者本人のみ（BK-5 で実装） |
| ピンの削除 | ○（全件） | 作成者本人のみ（BK-5 で実装） |
| タグの追加 | ○ | ○（BK-5 で実装） |
| タグの削除 | ○（全件） | 作成者本人のみ（BK-5 で実装） |

### 決定3: `sanpo_map_id` 省略時は「最初の地図」を同一トランザクションで作る

- `POST /pins` の `sanpo_map_id` は**省略可・null 不可**（`SkipJsonSchema[None]` で
  OpenAPI 上も non-nullable の optional として表現し、明示 `null` は 422 にする）。
- 省略時: 自分の既定地図（`sanpo_maps.is_default = true AND owner_user_id = 自分`）を
  取得し、無ければ**同一トランザクションで**「最初の地図」という名前の地図を作って
  既定にする。地図一覧の別 API 呼び出しを要求しない（1往復で完結し、写真ありのピン
  登録が地図作成の成否に引きずられない）。
- `is_default` は「owner ごとに1つ」を DB の部分一意インデックス
  （`WHERE is_default`）で担保する。同時作成のレースは `IntegrityError` を savepoint で
  捕捉し、既存の既定地図を再取得して返す（`users/repository.py::create()` と同じ
  冪等パターン）。
- `GET /sanpo-maps` の `is_default` は**リクエストユーザーにとっての既定地図か**
  （`is_default AND owner_user_id = 自分`）を返す。他人の既定地図に招待された editor には
  `false` を返す（自分の既定地図の有無で「最初の登録か」を判定する mobile 側の規則と
  一致させるため）。
- **`GET /sanpo-maps` はピンの件数を返さない**（mobile 案にあった `spot_count`
  相当は削除）。`pins → sanpo_maps` の一方向依存を保つため（`sanpo_maps` は `pins` の
  存在を一切知らない）。件数が必要になったら地図管理チケット（BK-6）で
  `pin_count` を optional field として expand する。

### 決定4: 写真は presigned POST で先行アップロードし、ピン作成 API が確定を兼ねる

1. mobile は `POST /pin-photo-uploads`（`content_type`, `byte_size`）で
   アップロード枠を取得する。応答は presigned POST の `url`/`fields`
   （`upload_id` 別に発行、S3 の `content-length-range` で1枚の上限を強制）。
2. mobile はフィールドをそのまま multipart で S3 の `staging/pins/<user_id>/<upload_id>.jpg`
   へ POST する（成功は S3 既定の 204）。
3. `POST /pins`（新規ピン作成）に `photo_upload_ids` を含めると、**同じリクエストの中で
   確定処理**（検証・サムネイル生成・`staging/` → `original/pins/` への Copy・DB書き込み）
   まで行う。ピン作成と写真の紐付けが1リクエストで原子的に見え、「写真の欠けたピン」を
   クライアントに見せない。

確定処理（`pins/photo_attacher.py`）の順序: **全枚数の検証・サムネイル生成 →
（全て成功したら）Copy → DB commit → staging の best-effort 削除**。この順序（S3 → DB）
により、**DB が存在しない S3 オブジェクトを指す状態は作らない**。残りうる不整合は
「DB から参照されない `original/`・`thumb/` オブジェクト」だけで、容量は DB 集計
（後述）なので利用者の容量には影響しない（コストだけの問題。定期掃除は別チケット BK-3）。

presigned POST を選んだ理由（PUT ではなく）:

- `content-length-range` で S3 側に1枚の上限を強制できる（PUT は Content-Length の
  厳密一致のみで、上限の指定ではない）。
- `key` の完全一致条件により、クライアントは自分の `user_id` prefix 以外へ書き込めない
  （キーはサーバーが `user_id`・`upload_id` から決定的に組み立て、クライアントには渡さない）。

S3 キーは常に `pins/photo_keys.py` の純粋関数で組み立てる:
`staging/pins/<user_id>/<upload_id>.jpg` → `original/pins/<user_id>/<upload_id>.jpg`
（確定後）、サムネイルは `thumb/pins/<user_id>/<upload_id>/512.jpg`。`user_id` を
prefix に入れるのは、アカウント削除時に prefix 単位で一括削除できるようにするため
（BK-2）。

### 決定5: 写真の枚数はピン全体で無制限、1リクエストの確定は10枚まで

- **1つのピンに紐付けられる写真の総数に上限を設けない**（ユーザー決定）。
- **`POST /pins` の `photo_upload_ids` は1リクエストにつき最大10件**
  （`PIN_PHOTOS_PER_REQUEST_MAX`, OpenAPI の `maxItems`）。Lambda 1024 MB・時間予算
  20秒・並列度3の下で、1枚最悪 ~1秒×10枚を並列3で ~4秒に収める見積もりに基づく。
- 11枚目以降は新設の **`POST /pins/{pin_id}/photos`**（1〜10枚/回）で追加する。
  確定処理は `POST /pins` と共通（`PhotoAttacher`）で、認可は「ピンの属する地図の
  member で `can_add_pin_photo(role)`」（owner/editor とも可。招待ユーザーが owner の
  ピンに写真を足す要件をそのまま満たす）。指定した枠が既にそのピンに紐付いていれば
  成功扱い（冪等な再送）、別のピンに紐付け済みなら 409。
- `PinRead.photos` は **position 順で先頭10件（`PIN_READ_PHOTOS_LIMIT`）+ `photo_count`
  （総数）**を返す。枚数無制限でも応答を有界に保つため。全件のページング取得は
  閲覧チケット（BK-4）の `GET /pins/{pin_id}/photos` に委ねる。

### 決定6: サムネイルは backend が確定時に Pillow で同期生成する

検討した3案（後述「検討した選択肢」）のうち、**backend が確定時に Pillow で同期生成する
案**を採用した。原本から必ずサムネイルを作るため原本との不一致が起こり得ず、生成過程の
デコードが「JPEG として正しいことの検証」を兼ねる（マジックバイト検査より強い）。

- サイズは**1つ（長辺512px、JPEG品質80、約30〜80KB）**。一覧・グリッド・地図のピン
  吹き出しをカバーする。詳細表示は端末で長辺2048px程度に縮小済みの原本
  （ユーザー決定により端末側の縮小・再圧縮・EXIF除去は維持）がそのまま使えるため、
  中間サイズは作らない。
- `pin_photos.thumbnail_*` 列は **NULL 許容**にしてある。今回は同期生成なので常に
  埋まるが、将来サムネイル生成を非同期化する場合（BK-9）に列追加なしで
  「生成待ち（null）」を表現できるようにするため。応答の `thumbnail` フィールドも
  nullable にしてあり、生成待ち・storage 不調時は `null`（クライアントはプレースホルダを
  出す）。
- `pin_photos.width`/`height` は**クライアント申告ではなくサーバーがデコードした実寸**
  （枠発行のリクエストから mobile 案にあった `width`/`height` を外した。サムネイル
  生成で必ずデコードするため、クライアント申告を信用する理由が無くなった）。
- Pillow の `Image.draft()`（JPEG の DCT 縮小デコード）でメモリ・CPU を抑え、
  `Image.MAX_IMAGE_PIXELS` 相当の独自上限（`PIN_PHOTO_MAX_PIXELS`, 既定 4000万画素）を
  デコード前のヘッダー情報だけでチェックする（decompression bomb 対策）。
  サムネイルは常に EXIF を含めずに生成する（`save()` に `exif=` を渡さない）。

### 決定7: 容量はアップロード者に計上し、原本のみを数える

- **ユーザーごとの合計容量は 1 GiB**（`PIN_PHOTO_USER_QUOTA_BYTES`）。共有地図に他人が
  上げた写真で地図の owner の容量が埋まらないよう、**アップロードした本人**に計上する
  （`pin_photos.uploaded_by_user_id` 基準）。
- **サムネイルは容量に数えない**（原本のサイズの数%程度で、利用者が制御できない量を
  上限に含める理由が無い）。
- 使用量 = `SUM(pin_photos.byte_size WHERE uploaded_by = 自分)`（確定済み）
  + `SUM(pin_photo_uploads.declared_byte_size WHERE status='pending' AND 未期限)`
  （枠発行時点の申告値による先食い分）。枠発行はユーザー単位の
  `pg_advisory_xact_lock(namespace, key)`（2引数版でロックの名前空間を固定し、他用途と
  衝突しないようにする）で直列化し、連打による容量の先食みと同時発行の競合を DB だけで
  防ぐ。
- 確定時には**実サイズ**（S3 上の実際のバイト数）で容量を再チェックする
  （申告値と実サイズがズレていても、実サイズ基準で最終判定する）。超過なら 409
  `"Storage quota exceeded"`。
- 未使用の枠の同時保有数にも上限（`PIN_PHOTO_MAX_PENDING_UPLOADS`, 既定30）を設け、
  超過は 429（連打による先食い自体を防ぐ）。

### 決定8: ストレージは `STORAGE_MODE=real|fake` + Unconfigured で切り替える

`AUTH_MODE`/`MAPS_MODE`/`FEATURE_FLAG_MODE` と同じ fail-safe な流儀
（`ENV=local`/`test` 以外で `real` 以外を選ぶと起動失敗）を S3 にも適用した。

- **real**: boto3 で S3 に接続する。`PIN_PHOTO_BUCKET_NAME` が空なら
  `UnconfiguredObjectStorage`（全メソッドが `ObjectStorageUnavailableError`
  → 503。AWS を一切呼ばない構造的な安全策）にフォールバックする。
- **fake**: プロセス内メモリの実装（`FakeObjectStorage`）。presigned POST/GET の
  代わりに backend 自身の `/dev-storage/*`（`STORAGE_MODE=fake` のときだけ
  `include_in_schema=False` で include。本番の OpenAPI には一切現れない）を指す
  URL を発行する。URL はリクエストの `base_url` から組み立てるため、Android
  エミュレータ（`10.0.2.2`）や LAN 越しの実機からも届く。署名は HMAC-SHA256
  （`AUTH_JWT_SECRET` を鍵に流用。ローカル専用の改ざん検知として十分）。
- **`template.yaml` への S3 結線（BK-1）は本 PR に含めない**。infra（SS-106/107）の
  dev apply 前に `{{resolve:ssm:}}` で存在しない SSM パラメータを参照すると
  `sam deploy` 自体が失敗し、無関係な修正を含め backend のデプロイ全体が止まるため
  （[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) 決定9・
  [deployment.md](../../packages/backend/docs/deployment.md) Phase 0 と同じ理由）。
  結線までは dev/staging/production で写真 API が 503 になるだけで、フラグ
  `pin_registration` が OFF の間は mobile から呼ばれないため利用者影響は無い
  （詳細は [deployment.md](../../packages/backend/docs/deployment.md) §12）。

### 決定9: 他人の地図・ピン・アップロード枠は 404/409 で存在を漏らさない（IDOR 対策）

[ADR-003](./ADR-003-walk-record-persistence-and-history-api.md) 決定6 と同じ構造的な
担保を、地図・ピン・アップロード枠のすべてに適用する。

- 地図: `SanpoMapRepository` の読み取りは全て `user_id` を必須引数に取り、
  `sanpo_map_members` との JOIN で絞る。member でない地図は 404（`SanpoMapNotFoundError`）。
- ピン: `PinRepository.get_for_member_for_update()` は `pins JOIN sanpo_map_members` で
  取得する。見つからなければ 404（`PinNotFoundError`）。
- アップロード枠: `PinPhotoUploadRepository.lock_for_attach()` は `user_id` を必須引数に
  取り、他人の `upload_id` は「見つからない」扱いにする（件数不一致として 409
  `PinPhotoUploadNotReadyError` に丸め、「存在しない」「他人のもの」「期限切れ」
  「使用済み」を区別しない）。招待機能が入っても「他人の枠を自分のピンに紐付ける」
  ことはできない設計を維持する（枠の持ち主 = アップロード者 = 容量の計上先、という
  対応を崩さない）。
- S3 キーはクライアントから受け取らない。presigned POST は `key` 完全一致の条件で
  縛るため、他人の prefix に書き込めない。presigned GET は DB で認可済みの写真にしか
  発行しない。

### 決定10: フラグ `pin_registration` は API をガードしない。`app_config_probe` は本 PR で削除

- `core/feature_flags.py` の `FEATURE_FLAGS` に `pin_registration`（`audience="client"`）
  を追加した。mobile はこのフラグで「この場所にピンを追加」ボタンと登録画面の出し分けを
  行う。
- **backend の API 自体はこのフラグでガードしない**。理由: (1) 認証必須で本人のデータ
  しか作れず、UI が無ければ実害が無い、(2) フラグ削除時に backend の分岐とテストの
  状態数まで増える、(3) ストレージ未構成は Unconfigured → 503 で既に安全側に倒れている。
- **`app_config_probe`（疎通確認用フラグ）は同じ PR で削除する**
  （[ADR-008](./ADR-008-deploy-release-separation.md) SS-98 追補 D7 の規定どおり、
  最初の実フラグが入った時点で削除する）。`/app-config` の `flags` は map なので、
  古い mobile ビルドは未知キーが減っても壊れない。

## 検討した選択肢

### サムネイル生成方式

#### 選択肢1: クライアントが原本とサムネイルの両方をアップロード

- **概要**: mobile が端末側でサムネイルも生成し、原本と2枚アップロードする。
- **メリット**: backend の追加負荷がほぼ無い（確定処理は HEAD のみで済む）。
- **デメリット**: 2回のアップロードの片方だけ成功しうる。サムネイルと原本の
  不一致（改造クライアントが別画像を置く等）をサーバー側で検出できない。枠を
  2種類発行し2回送信する必要があり、mobile の実装コストが増える。

#### 選択肢2: backend が確定時に Pillow で同期生成 ← 採用

- **概要**: 決定6のとおり。原本から必ず生成し、確定処理の一部として同期実行する。
- **メリット**: 原本との一致が保証される。デコードが検証を兼ねる。失敗は確定ごと
  ロールバックでき中間状態が無い。境界（SS-107）が許可する Get/Put の範囲で完結する。
- **デメリット**: Lambda のメモリ・時間を消費する（1枚 ~0.1〜0.5秒。並列度3・
  1リクエスト10枚の制限で予算内に収める設計にした）。Pillow の manylinux wheel が
  zip に約4〜5MB 増える（`sam build --use-container` は既に必須のため増分コストのみ）。

#### 選択肢3: 非同期生成（S3 イベント / 別 Lambda）

- **概要**: 確定は Copy のみ行い、サムネイル生成を非同期（S3 イベント通知や
  非同期 Lambda invoke）で行う。
- **メリット**: API Lambda（確定処理）の負荷が増えない。
- **デメリット**: **S3 イベント通知は使わない前提**（infra 側の設計、案C）。
  Lambda の非同期 invoke には境界に `lambda:InvokeFunction` が無く、SQS も許可
  されていないため infra への追加依頼が要る。サムネイル未生成の期間が生じ、
  詳細画面に「生成待ち」の表示が必要になる。

### 写真本体の送信経路

#### 選択肢1: API（CloudFront → Lambda）経由で送る

- **概要**: `multipart/form-data` を通常の API エンドポイントで受ける。
- **メリット**: mobile の実装が単純（`customFetch` を1回呼ぶだけで済む）。
- **デメリット**: CloudFront + OAC 構成ではボディを持つ POST/PUT に
  `x-amz-content-sha256` の計算をクライアントに要求する。Lambda 同期呼び出しの
  ペイロード上限（6 MB）に達しうる。

#### 選択肢2: presigned POST で S3 に直接アップロード ← 採用

- **概要**: 決定4のとおり。
- **メリット**: 写真本体が Lambda を経由しない。`content-length-range` で上限を
  S3 側に強制できる。infra 側（SS-106）の想定とも一致する。
- **デメリット**: mobile の実装が2段階（枠発行 → S3 への POST）になる。

### 地図とピンの関係

#### 選択肢1: 多対多（1つのピンを複数の地図に入れられる）

- **概要**: 中間テーブルで `pins` と `sanpo_maps` を多対多にする。
- **メリット**: 「同じ場所を複数のカテゴリ別地図に入れる」ような使い方ができる。
- **デメリット**: 「どの地図の owner がピンを削除できるか」「写真の容量をどの地図に
  計上するか」の判定が複雑になる。task 本文の要件（「地図に紐付けていく」）は
  N:1 で満たせる。

#### 選択肢2: N:1（ピンはちょうど1つの地図に属する）← 採用

- 決定2のとおり。

## 決定理由

**サムネイル・写真送信経路のどちらも、「境界（SS-107）が許可する範囲で完結するか」を
最優先の判断基準にした。** infra への追加依頼（S3 イベント通知、非同期 invoke、
CloudFront 経由の配信）は、それぞれ Terraform 側の別チケットと承認を要し、
本チケットの完了を infra のスケジュールに縛ってしまう。選択肢2（同期生成・presigned
POST）はどちらも既存の境界だけで実装でき、かつ選択肢1（クライアント2重アップロード・
API 経由送信）が抱える整合性・上限の問題を構造的に避けられる。

**地図とピンの関係を N:1 にしたのは、権限判定の単純さを優先したため。** 多対多にすると
「ピンを削除できるのはどの地図の owner か」が地図の組み合わせ次第で変わり、
IDOR 対策（決定9）の実装も複雑になる。task 要件を満たすのに多対多である必要が無い
以上、単純な方を選ぶ。

## 影響

### ポジティブな影響

- 写真アップロードが Lambda を経由しないため、ペイロード上限・SigV4 ヘッダー計算の
  問題を回避できる。
- サムネイル生成が原本のデコードを兼ねるため、不正な画像（decompression bomb・
  JPEG 以外）を安価に弾ける。
- `sanpo_map_members` に owner の行を持たせたことで、招待機能（BK-7）を
  `role="editor"` の行を足すだけで拡張できる（既存の権限判定コードを変更しない）。
- ストレージの `STORAGE_MODE=fake` により、S3 バケットが無くても（infra の
  apply を待たずに）ローカル・E2E で写真付きのフローを最初から最後まで確認できる。

### ネガティブな影響・トレードオフ

- 確定処理（Pillow のデコード・並列3並行）が API Lambda のメモリ・CPU・時間を
  消費する。1リクエスト10枚の制限と時間予算（20秒）を設けて Lambda の29秒制約に
  収めているが、Lambda の `MemorySize` を下げる変更が入る場合は
  `PIN_PHOTO_CONFIRM_CONCURRENCY` も合わせて見直す必要がある。
- `template.yaml` の結線（BK-1）が本 PR に含まれないため、dev/staging/production では
  当面「写真無しのピン登録」しか実際には使えない。infra 側（SS-106/107）の dev apply
  が完了するまで、写真付きの実機確認は `STORAGE_MODE=fake` に頼ることになる。
- 未参照の `original/`・`thumb/` オブジェクト（確定処理の途中失敗で残りうる）は
  容量には数えないが、コストは発生し続ける。定期掃除（BK-3）が入るまでは
  手動での確認・削除に頼る。
- タグの正規化（trim・連続空白圧縮・先頭記号除去・小文字化での重複判定）は
  mobile と backend の二重実装になる。ロジックがずれるとサーバー側の重複排除が
  mobile の表示と食い違いうる（ケース表を両テストに同じ内容で置くことで検知する）。

### 移行・対応が必要な事項

- [ ] **BK-1**: `template.yaml` に写真バケットを結線する（infra SS-106/107 の dev apply
      後。detail は [deployment.md](../../packages/backend/docs/deployment.md) §12）
- [ ] **BK-2**: アカウント削除（`DELETE /users/me`）時に本人の写真（original/thumb/staging）
      を S3 から削除する。**prod でフラグ ON にする前提条件**（DB は CASCADE で消えるが
      S3 のオブジェクトは残るため）
- [ ] **BK-3**: 期限切れ `pending` 枠の行削除と、対応する未参照 S3 オブジェクトの掃除
      （定期実行）
- [ ] **BK-4**: 閲覧 API（`GET /pins?sanpo_map_id=`、`GET /pins/{pin_id}`、
      `GET /pins/{pin_id}/photos` の全件ページング、原本の presigned GET）
- [ ] **BK-5**: 編集・削除 API（`PATCH`/`DELETE /pins/{id}`、写真・タグの削除）と
      権限マトリクス（決定2の表）の実装
- [ ] **BK-6**: `POST /sanpo-maps`（地図の新規作成）、地図管理、`pin_count` の expand
- [ ] **BK-7**: 招待・メンバー管理。招待ユーザー退会時に他人の地図へ付けたピン・写真・
      タグを消すかは未決（MVP は全て `ON DELETE CASCADE`）。**BK-10 が前提**
- [ ] **BK-8**: `GET /users/me/storage-usage`（使用量 / 上限の表示）
- [ ] **BK-9**: サムネイルの非同期化（負荷・枚数要件が変わった場合のみ。
      `pin_photos.thumbnail_*` の NULL 許容で列追加なしに移行できる）
- [ ] **BK-10**: 原本の EXIF をサーバーで無劣化除去する（JPEG の APP1 セグメント除去）。
      **招待機能（BK-7）の前提**（招待前は本人しか原本を見られないため後回しにしている）
- [x] mobile 側の実装（Orval 再生成、`features/pin/` として実装済み。同じ PR で backend の
      後に実装した）

## 関連情報

- [ADR-002: 認証は Google Sign-In + backend 自前セッショントークン](./ADR-002-auth-google-signin-and-stub-strategy.md)
  —— `get_current_user` の choke point、モード切替の fail-safe 方針
- [ADR-003: 散歩記録の永続化と履歴 API](./ADR-003-walk-record-persistence-and-history-api.md)
  —— `client_*_id` 冪等作成、他人のリソースは404、`relationship()` を張らない方針
- [ADR-005: backend は Lambda Function URL + CloudFront](./ADR-005-backend-serverless-deployment-lambda-function-url.md)
  —— マイグレーションのデプロイ順序、ペイロード上限、SigV4 ヘッダーの制約
- [ADR-008: デプロイとリリースの分離](./ADR-008-deploy-release-separation.md)
  —— フィーチャーフラグの登録簿・削除ルール（`app_config_probe` の扱い）
- [packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md) §12
  —— `template.yaml` への S3 結線（BK-1）の確定事項・トラブルシュート
- Plane: SS-88（本 ADR）、SS-106/SS-107（infra, S3 バケット・境界）
