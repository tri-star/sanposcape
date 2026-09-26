# ADR-009: 地図（SanpoMap）とピン（Pin）のデータモデル、写真の先行アップロードとサムネイル生成

## 現在有効な決定（要約）

> 最終更新: 2026-09-26（SS-118: 地図表示の limit 超過時の見せ方を決着）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **用語はピン（Pin）/ 地図（SanpoMap）/ スポット（`SpotCandidate` に限定）**（本文: 決定1）
- **地図とピンは N:1、権限は `sanpo_map_members` の role で判定する**（本文: 決定2）
- **`sanpo_map_id` 省略時は「最初の地図」を同一トランザクションで作る**（本文: 決定3）
- **写真は presigned POST で先行アップロードし、ピン作成 API が確定を兼ねる**。確定は S3 →
  DB の順で行い、DB が存在しない S3 オブジェクトを指す状態は作らない（本文: 決定4）
- **写真の枚数はピン全体で無制限、1リクエストの確定は10枚まで**。未使用（未紐付け）枠の同時保有は
  既定30で、超過は 429（本文: 決定5、決定7）
- **サムネイルは確定時に Pillow で同期生成する**（長辺 512px）（本文: 決定6）
- **容量はアップロード者に計上し、原本のみを数える**（既定 1 GiB）（本文: 決定7）
- **ストレージは `STORAGE_MODE=real|fake` + `Unconfigured` で切り替える**。`PIN_PHOTO_BUCKET_NAME`
  が空なら写真を確定・発行する書き込み系 API は 503。閲覧 API は 503 にしない（本文: 決定8、決定18）
- **`STORAGE_MODE=fake` の保存先はディスク**（`DEV_STORAGE_DIR`）。空ならプロセス内メモリ
  （テストの既定）（本文: 2026-09-23 追補）
- **他人の地図・ピン・アップロード枠は 404/409 で存在を漏らさない**（IDOR 対策）（本文: 決定9）
- **フラグ `pin_registration` は API をガードしない**（本文: 決定10）
- **`DELETE /pin-photo-uploads/{upload_id}` で未使用の枠を取り消せる**（本文: 決定11、PR #93 追補）
- **409 応答は機械可読な `code` を持つ**（`storage_quota_exceeded` / `photo_upload_not_ready`）
  （本文: 決定12、PR #93 追補）
- **backend はアクセスログを1リクエスト1行で出す**（`core/observability.py`。`create_app()` で
  最後に登録して最外層に置く。クエリ文字列・ヘッダー・ボディは出さない）（本文: 決定13、SS-88 追補）
- **直送の失敗は原理的にサーバー側から見えない**ので、可観測性は端末側に持たせる。サーバー側から
  見る必要がある場合は S3 サーバーアクセスログが唯一の手段（本文: SS-88 追補）
- **閲覧 API（`GET /pins`・`GET /pins/{pin_id}`・`GET /pins/{pin_id}/photos`）を追加した**
  （BK-4 完了）。bbox・`q`・`tags` によるキーワード検索、keyset ページング、原本の presigned
  GET（`PinPhotoRead.original_url`）を持つ。ストレージ未構成・障害時も 200 を返し URL を
  null にする（本文: SS-111 追補）
- **`GET /pins` は `sanpo_map_id` 必須、並びは `created_at DESC, id DESC`、limit 既定50・最大200**。
  bbox を指定しても作成日時順のままなので、範囲内のピンが limit を超えると古いピンが次ページに回る
  （本文: SS-111 追補「一覧の必須パラメータ・並び順・件数上限」）
- **編集・削除 API（`PATCH /pins/{id}`・`DELETE /pins/{id}`・`DELETE /pins/{id}/photos/{id}`）を
  追加した**（BK-5 完了）。権限マトリクスは「地図 owner」「対象の作成者本人（editor）」
  「作成者ではない editor」「非メンバー」の4区分で確定し、非メンバーは404、権限が無ければ403
  （本文: SS-112 追補）
- **PATCH はフィールド単位の部分更新とタグの差分（`add_tags`/`remove_tag_ids`）**。全置換は
  採らない（共同編集での lost update・タグごとの権限判定の分かりやすさのため）。タグが10件を
  超えると409（`code: "tag_limit_exceeded"`）（本文: SS-112 追補）
- **削除時の S3 実体は「DB commit → best-effort の即時削除」**。ストレージ障害・未構成でも
  削除 API は503にしない。`ObjectStorage.delete_many()`（S3 の DeleteObjects）で複数キーを
  まとめて削除する（本文: SS-112 追補）。**削除用の S3 client は再試行なし・短い timeout で、
  2つ目以降のチャンクは残り時間が1回の最悪時間以上のときだけ始める（締め切り + 1回の
  最悪時間 ≤ 25 秒を起動時に検証）**（本文: 決定22 追補, 2026-09-26 追補）

### 未解決・持ち越し

- **BK-2**: アカウント削除時の写真削除。**prod でフラグ ON にする前提条件**（本文: 移行・対応事項）
- **BK-3, BK-6〜BK-10**: 期限切れ枠の掃除、地図管理、招待、使用量 API、サムネイルの非同期化、
  原本の EXIF 除去（本文: 移行・対応事項。BK-4「閲覧 API」は SS-111、BK-5「編集・削除 API」は
  SS-112 で完了した）
- ~~**地図表示で limit を超えたときの見せ方**（ページングを続けるか、クラスタ表示にするか）は
  SS-118 で決める。~~ → **SS-118 で決着**（ページングを続けず上限200件 + 案内。mobile
  [ADR-012](../../packages/mobile/adr/ADR-012-pin-map-display-and-detail.md) D3。本文: 2026-09-26 追補）。
  **検索タブのタグ候補 API** は未実装で、必要なら SS-120 で別途切る（本文: SS-111 追補）
- **prod への結線**: infra 側（`deployments/prod/account` / `deployments/prod/platform`）の
  apply 待ちで、backend の prod デプロイ自体がまだできない（本文: 決定8 の SS-108 追補）
- **Lambda 実行ロールでの直送**は未再現。2026-09-24 の dev 疎通確認はローカルの管理者権限で
  署名しており、IAM の付与・境界は静的確認で代替している（本文: SS-88 追補）

### 変更・撤回された決定

- `STORAGE_MODE=fake` の保存先: プロセス内メモリ → **ディスク**（`DEV_STORAGE_DIR`）
  （2026-09-23 追補）
- `template.yaml` への S3 結線（BK-1）: 「本 PR に含めない」→ **SS-108 で実施し、dev の疎通確認も
  完了**（SS-108 / SS-88 追補）

## 日付

2026-09-21（初版、SS-88）、2026-09-21 追補（PR #93: Copilot レビュー対応の backend 分。
アップロード枠の取り消し API、409 応答の機械可読 code）、2026-09-22 追補（SS-108:
`template.yaml` への S3 結線）、2026-09-23 追補（`STORAGE_MODE=fake` の保存先をディスクへ）、
2026-09-24 追補（SS-88: 実機不具合の調査で判明したアクセスログの必要性と、dev の疎通確認完了）、
2026-09-24 追補（SS-111: 閲覧 API の追加。BK-4 完了）、
2026-09-25 追補（SS-112: 編集・削除 API と権限マトリクスの確定。BK-5 完了）、
2026-09-26 追補（SS-112: PR #101 レビュー対応。削除の時間予算の有界化）、
2026-09-26 追補（SS-118: mobile が地図表示の limit 超過時の見せ方を決着。閲覧 API・データモデルの
backend 側変更は無い）

## ステータス

採用（backend・mobile 実装済み）。`template.yaml` への S3 結線（BK-1）は SS-108 で実施済みで、
**dev での疎通確認も完了**（2026-09-24。下の「追補（2026-09-24）」）。prod は infra 側の
prod apply 待ち。

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
  は別チケット（BK-5）で実装する。**（SS-112 で決定19・24 に置き換え。BK-5 は実装済み）**

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

上表は BK-5 着手前の予定表であり、実装済みの確定版は「追補（2026-09-25, SS-112 編集・削除 API）」
の決定19を参照。特に写真の削除（上表に無い行）は「アップロード者本人 + owner」で、タグの削除の
「作成者」は**タグの作成者**（`pin_tags.created_by_user_id`）を指す（ピンの作成者ではない）。

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
  閲覧チケット（BK-4）の `GET /pins/{pin_id}/photos` に委ねる（SS-111 で実装済み。
  `(position, id)` の keyset ページング、決定17）。

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
- **（SS-108 追補）結線は infra の dev apply 後に SS-108 で行った**。Api にだけ
  `PIN_PHOTO_BUCKET_NAME`（SSM `pin_photos/bucket_name`）を渡し、実行ロールには
  `pin_photos/bucket_arn` で絞ったインライン Statement（`staging/*`・`original/*`・`thumb/*` に
  Put/Get/Delete、バケットに ListBucket）を付ける。`S3CrudPolicy` 等は使わない。
  `template.yaml` は dev/prod 共通で環境による条件分岐は入れない。prod のデプロイは写真と
  関係なく既に AppConfig（SS-98）の SSM を前提にしており、その apply（`deployments/prod/platform`）で
  `pin_photos/*` も同時に作られるため、結線によって prod の前提は増えない
  （prod の適用順序は [deployment.md](../../packages/backend/docs/deployment.md) §12）。
- **（2026-09-23 追補）fake の保存先をディスクにした**。プロセス内メモリだと
  `uvicorn --reload`（コード変更のたび）やコンテナ再起動で写真だけが消え、DB 上のピン・写真の
  行は残るため表示が 404（`NoSuchKey`）になり、ローカルでの確認が続けにくかった。
  `DEV_STORAGE_DIR`（ローカルでは `compose.yaml` / `.env.example` が
  `storages/dev-storage` を渡す。`packages/backend` からの相対パス）が設定されていれば
  `<dir>/objects/<key>` に本体、`<dir>/content-types/<key>` に Content-Type を書く。
  中身は `.gitignore` 対象で、ディレクトリ自体は `.gitkeep` で残す。
  - DB が参照している写真を黙って消さないよう、ディスク保存では容量による追い出しをしない
    （不要になればディレクトリの中身を手で消す）。
  - キーは署名済みだが、`..`・絶対パス・空要素を含むキーは多重防御として拒否する
    （保存先の外へ読み書きさせない）。
  - `DEV_STORAGE_DIR` が空（`Settings` の既定。テストはこれ）なら従来どおりプロセス内メモリ。
  - MinIO / LocalStack は採用しなかった。`S3ObjectStorage` は virtual-hosted-style のため
    接続先を明示しない作りで、差し替え口を足す変更が広がる一方、ローカルで確かめたいのは
    presigned POST 互換の流れと表示であり、fake のままで足りるため。

### 決定9: 他人の地図・ピン・アップロード枠は 404/409 で存在を漏らさない（IDOR 対策）

[ADR-003](./ADR-003-walk-record-persistence-and-history-api.md) 決定6 と同じ構造的な
担保を、地図・ピン・アップロード枠のすべてに適用する。

- 地図: `SanpoMapRepository` の読み取りは全て `user_id` を必須引数に取り、
  `sanpo_map_members` との JOIN で絞る。member でない地図は 404（`SanpoMapNotFoundError`）。
- ピン: `PinRepository.get_for_member_for_update()` は `pins JOIN sanpo_map_members` で
  取得する。見つからなければ 404（`PinNotFoundError`）。閲覧系（書き込みロックを取らない
  `get_for_member()`/`list_for_member()`）も同じ JOIN で絞り、SS-111 で追加した（決定14）。
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

## 追補（2026-09-21, PR #93 レビュー対応）

PR #93（本 ADR の実装 PR）に対する `copilot-pull-request-reviewer` の指摘のうち、
backend の設計に関わる2件（アップロード枠の取り消し・409 応答の機械可読化）をここに
追記する。他の指摘（時間予算チェックの追加箇所・タグ長の検証タイミング・decompression
bomb の捕捉漏れ等）は決定4〜7・決定9の実装の精緻化であり、設計判断としての追補は不要
と判断した。

### 決定11: `DELETE /pin-photo-uploads/{upload_id}` で未使用の枠を取り消せるようにする

**背景**: mobile は「枚数無制限」の要件（決定5）を満たすため、写真を先行アップロードした
直後にピンへの紐付けを待たずに削除できる UI を持つ（`usePinPhotos.ts` の
`removePhoto`）。ところが枠を解放する API が無かったため、削除しても backend の
`pin_photo_uploads` 行は `pending` のまま紐付け期限（既定6時間）まで残り、未使用枠の
保有上限（決定 B-D6, 30件）と容量予約（決定 B-D5 の `sum_reserved_bytes`）を占有し続ける。
数十枚を追加・削除する操作を繰り返すと、実際にはどの枠も使っていないのに
`too_many_pending_uploads`（429）で新規の先行アップロードができなくなる。

**決定**: `DELETE /pin-photo-uploads/{upload_id}`（`operationId: delete_pin_photo_upload`）
を追加する。

- 対象は**本人の `pending` の枠のみ**。他人の・存在しない `upload_id` は「見つからない」
  扱いで 404（決定9の IDOR 対策と同じ丸め方。`PinPhotoUploadRepository.
  find_own_for_update()` が `user_id` を必須引数に取る）。
- 既に写真として紐付け済み（`status="attached"`）の枠は 409（取り消しは未紐付けの枠専用。
  紐付け済みの写真を消すのは別チケット BK-5「写真の削除」の範囲）。
- DB 行は物理削除する（`status` に「取り消し済み」を増やさない）。容量予約
  （`sum_reserved_bytes`）・未使用枠カウント（`count_active_pending`）はどちらも
  `status="pending"` の行を数えるクエリのため、削除すれば即座に対象から外れる。
- S3/フェイクストレージ側の `staging/` オブジェクトは commit 後に best-effort で削除する
  （失敗しても staging は S3 のライフサイクルで最終的に消えるため実害がない。決定4の
  `cleanup_staging()` と同じ方針）。
- 行の取得は `with_for_update()` で行ロックする。理由: 別リクエストが同じ枠を
  `lock_for_attach()`（決定4・PinService._prepare_photos）で確定処理中に、ロックなしで
  `pending` の古い状態を読んで削除してしまうと、直後に相手が `attached` へ更新して
  commit する、という取り消し不能な競合（本来 409 になるべき削除が成功してしまう）が
  起こりうる。行ロックを取ることで、確定処理の commit/rollback を待ってから最新の
  `status` を確認できる。

**検討した代替案**: 行を消さず `status` に `"cancelled"` を追加する案は、
`PIN_PHOTO_UPLOAD_STATUSES` の CHECK 制約・関連クエリの分岐が増えるだけで、
取り消した枠を後から参照する要件が無いため見送った。

### 決定12: `POST /pins`・`POST /pins/{pin_id}/photos` の 409 応答に機械可読な `code` を追加する

**背景**: 両エンドポイントの 409 は `PinPhotoUploadNotReadyError`（写真の準備ができて
いない: 未完了・期限切れ・デコード不可・他人の枠等を区別しない, 決定9）と
`StorageQuotaExceededError`（容量超過）の両方から発生しうるが、応答は固定の `detail`
文字列だけで、どちらの原因かを機械的に区別する手段が無かった。mobile はこれを
区別できないため、容量超過（例: 1 GiB 到達）のときも「写真を削除して追加し直す」という
誤った案内をユーザーに出してしまう（Copilot レビュー指摘、mobile 側は
`pinSaveError.ts` で対応）。

**決定**: 409 の応答本体に `code: "storage_quota_exceeded" | "photo_upload_not_ready"`
を追加する（`PinConflictErrorRead` スキーマ、OpenAPI の `responses` にも反映）。

- `detail` の固定文言（`"Photo upload not ready"` / `"Storage quota exceeded"`）は
  既存クライアントとの後方互換のため変更しない。`code` は追加フィールドなので、
  未対応の古いクライアントは無視すればよい。
- `code` の付与は `main.py` の例外ハンドラ（`register_exception_handlers()`）に閉じている
  ため、`POST /pin-photo-uploads`（枠発行）の 409（`StorageQuotaExceededError` のみ発生。
  「写真の準備ができていない」との曖昧さが無い）にも同じ `code` が自動的に付く。
- `add_pin_photos` は元々 `_prepare_photos()` を `create_pin` と共有しており
  `StorageQuotaExceededError` も送出しうるが、`router.py` の 409 の `description` が
  「Photo upload not ready」のみだったため、この追補で実際の挙動に合わせて修正した
  （ドキュメントの不整合であり、挙動自体の変更ではない）。

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
  が完了するまで、写真付きの実機確認は `STORAGE_MODE=fake` に頼ることになる
  （**SS-108/SS-88 追補**: 結線は SS-108 で実施済み、dev apply も完了し、2026-09-24 に
  dev で疎通確認済み。prod は infra の apply 待ちで依然この状態）。
- 未参照の `original/`・`thumb/` オブジェクト（確定処理の途中失敗で残りうる）は
  容量には数えないが、コストは発生し続ける。定期掃除（BK-3）が入るまでは
  手動での確認・削除に頼る。
- タグの正規化（trim・連続空白圧縮・先頭記号除去・小文字化での重複判定）は
  mobile と backend の二重実装になる。ロジックがずれるとサーバー側の重複排除が
  mobile の表示と食い違いうる（ケース表を両テストに同じ内容で置くことで検知する）。

### 移行・対応が必要な事項

- [x] **BK-1**: `template.yaml` に写真バケットを結線する（SS-108 で実装。**dev の疎通確認は
      2026-09-24 に完了**——動的参照 + prefix 連結は完全な ARN に解決されており、写真付きピン登録で
      `original/` と `thumb/` にオブジェクトが作られ `staging/` が削除されることまで確認した。
      prod は infra 側の apply 待ちで未実施。detail は
      [deployment.md](../../packages/backend/docs/deployment.md) §12）
- [ ] **BK-2**: アカウント削除（`DELETE /users/me`）時に本人の写真（original/thumb/staging）
      を S3 から削除する。**prod でフラグ ON にする前提条件**（DB は CASCADE で消えるが
      S3 のオブジェクトは残るため）
- [ ] **BK-3**: 期限切れ `pending` 枠の行削除と、対応する未参照 S3 オブジェクトの掃除
      （定期実行）。**SS-112 の編集・削除 API で残りうる不整合が増えた**: S3 削除が
      時間予算の不足による打ち切り・ストレージ障害で失敗した場合の `original/`・`thumb/`
      の孤立オブジェクト（detail は「追補（2026-09-25, SS-112 編集・削除 API）」決定22）
- [x] **BK-4**: 閲覧 API（`GET /pins?sanpo_map_id=`、`GET /pins/{pin_id}`、
      `GET /pins/{pin_id}/photos` の全件ページング、原本の presigned GET）。**SS-111 で実装完了**
      （detail は「追補（2026-09-24, SS-111 閲覧 API）」）
- [x] **BK-5**: 編集・削除 API（`PATCH`/`DELETE /pins/{id}`、写真・タグの削除）と
      権限マトリクス（決定2の表）の実装。**SS-112 で実装完了**
      （detail は「追補（2026-09-25, SS-112 編集・削除 API）」）
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

## 追補（2026-09-24, SS-88 実機不具合の調査）

TestFlight のビルド5を iPhone 実機で試したところ、写真の直送が必ず失敗した。**原因は mobile 側**
（Expo の `fetch` が RN 形式の multipart ファイルパートを受け付けない。詳細は
[ADR-010 の追補（2026-09-24）](../../packages/mobile/adr/ADR-010-photo-service-and-direct-s3-upload.md)）
で、backend・infra には問題が無かった。ただし**切り分けに時間がかかった理由**は backend 側にも
あったため、その対処をここに記録する。

### 決定13（追補）: backend はアクセスログを1リクエスト1行で出す

調査を始めた時点で、CloudWatch Logs には `START`/`END`/`REPORT` しか残っておらず、
**「枠発行（`POST /pin-photo-uploads`）が 201 だったのか 401 だったのか」すら分からなかった。**
結局 CloudFront の `4xxErrorRate` メトリクス（1分粒度）から「その時刻の全リクエストが 2xx だった」
ことを読み取って、失敗点が枠発行より後だと確定させている。

ローカル（uvicorn）は uvicorn 自身がアクセスログを出すため気付きにくいが、**Lambda（Mangum）には
uvicorn が居ないので、アプリ側で出さない限り何も残らない**。`core/observability.py` に
`AccessLogMiddleware` を追加し、`method path -> status (N.Nms)` を INFO で出す。

- `RequestSizeLimitMiddleware` と同じく**素の ASGI ミドルウェア**として書く
  （`BaseHTTPMiddleware` を使わない = ストリーミング応答やバックグラウンドタスクの挙動を変えない）。
- `create_app()` で**最後に登録**する（Starlette の `add_middleware` は先頭に挿入するため、
  最後に登録したものが最も外側になる）。こうしないと `RequestSizeLimitMiddleware` が自前で返す
  413 を観測できない。
- **クエリ文字列・ヘッダー・ボディは出さない**（将来トークン等が載ったときに黙って漏れる経路を作らない）。
- `/health` は既定で除外する（docker compose のヘルスチェックが5秒ごとに叩くため）。
- ログレベルは `LOG_LEVEL`（既定 INFO）。`configure_logging()` は **root にも `sanposcape` ロガー
  自身にもハンドラーが無いときだけ**ハンドラーを足す（Lambda の python ランタイムは root に
  ハンドラーを付けるので、足すと二重に出る。一方 uvicorn は自分のロガーしか設定しないので、
  足さないと INFO が消える。`sanposcape` 側も見るのは、複数回呼ばれてもハンドラーを増やさないため）。

あわせて枠発行時に `upload_id` と **S3 キー**を INFO で残す（`pins/service.py`）。直送は backend を
通らないため、これが無いと「どのオブジェクトが届くはずだったのか」を後から S3 と突き合わせられない。
**`form.fields` は絶対にログへ出さない**（policy・署名・一時認証情報を含む）。

### 直送の失敗は原理的にサーバー側から見えない

決定4（presigned POST で直送）の帰結として、**直送が失敗しても AWS 側のどこにも痕跡が残らない**。
今回の調査で確認した範囲:

- backend（Lambda）は経路に居ないので CloudWatch Logs には出ない。
- バケットには S3 サーバーアクセスログが設定されていない。
- 調査中に CloudTrail の S3 データイベント（write）を有効化して再現したが、**1件も記録されなかった**。
  リクエストが1バイトも送信されていなかったためだが、仮に送信されていても CloudTrail の
  データイベントは呼び出し元を特定できたリクエストしか記録しないので、認証前に弾かれる失敗
  （`SignatureDoesNotMatch` / `MalformedPOSTRequest` 等）は残らない。
  **サーバー側から直送の失敗を見たい場合は S3 サーバーアクセスログ**（HTTP レベルで全リクエストを
  記録する）を一時的に有効化するのが唯一の手段になる（infra 側の作業）。

したがって**直送の可観測性は端末側に持たせるしかない**。mobile 側の対処は ADR-010 の決定10を参照。

### dev の疎通確認（BK-1 の完了）

ローカル backend を `STORAGE_MODE=real` + `PIN_PHOTO_BUCKET_NAME` で dev の実バケットに向け、
Android エミュレータから写真付きピン登録を通した（2026-09-24）。

- `POST /pin-photo-uploads -> 201`、`storage=S3ObjectStorage`
- S3 直送が 204、`staging/pins/<user_id>/<upload_id>.jpg` に 198171 バイト（`declared_bytes` と一致）
- `POST /pins -> 201`（2.4秒）後、`original/` に原本、`thumb/…/512.jpg` にサムネイル（28525 バイト）、
  `staging/` は削除済み

デプロイ済み Lambda の実行ロール・境界（SS-107）・バケットポリシーも読み取りで確認しており、
`{{resolve:ssm:}}` + prefix 連結が完全な ARN に解決されていることを確認済み
（deployment.md §12 の「初回デプロイで確認すること」1)〜3)）。
**ただし署名者はローカル実行時の管理者権限**であり、Lambda 実行ロールでの直送は
この確認では再現していない（付与・境界の静的確認で代替した）。

## 追補（2026-09-24, SS-111 閲覧 API）

BK-4（閲覧 API）を実装した。ADR 本文（決定1〜13）が決めていなかった点について、
SS-111 の実装計画で決めた事項をここに記録する。設計の再検討は行わない
（本チケットのスコープは閲覧のみで、編集・削除・権限マトリクスは BK-5 のまま）。

### 決定14: `GET /pins` の bbox は4つの独立したクエリパラメータにする

`bbox=lng,lat,lng,lat` のような1つの文字列ではなく、`min_latitude`/`min_longitude`/
`max_latitude`/`max_longitude` の4つのクエリパラメータにした。理由:

- 1つの文字列だと座標の順序（GeoJSON は経度が先）を取り違えやすい。
- 4つの独立したパラメータなら OpenAPI 上でも各値の範囲（緯度は -90〜90 等）を
  `Field(ge=…, le=…)` で表現でき、Orval が生成する型にも制約が現れる。

4つそろえて指定するか、1つも指定しないかのどちらかのみを許可する（`PinListQuery` の
`model_validator` で検証）。そろっていない場合と `min > max` の場合は 422。日付変更線を
またぐ範囲（`min_longitude > max_longitude` のような「範囲の反対側」の指定）は扱わない
（日本国内で使うアプリのため実害がない）。境界上の点は含める（`BETWEEN` の両端含む）。

### 決定15: 一覧の代表写真は `cover_photo: PinPhotoRead | null`（position が最小の写真）

`PinListItemRead` に既存の `PinPhotoRead` スキーマをそのまま使い回す（原本 URL・
`urls_expire_at` を含む）。理由: mobile が詳細画面の写真表示コンポーネントを共有できる。
画像キャッシュのキー（`photo.id`）もそのまま使える。一覧の各要素には `memo` を含めない
（最大1000文字あり、1ページ最大200件だと応答が大きくなる。詳細画面でしか使わないため）。
`tags` は含める（検索結果の表示に必要で、1ピン最大10件なので応答サイズの上限は変わらない）。

### 決定16: 原本の presigned GET は `PinPhotoRead.original_url: str | null` として返す

検討した代替案:

- (a) 写真ごとに原本の URL を返す専用エンドポイントを作る
- (b) 302 リダイレクトで返す

どちらもグリッドから拡大表示するたびに API 往復が1回増え、一覧・詳細の presigned URL を
事前にまとめて取れる利点が失われる。既存の `urls_expire_at`（「この写真に含まれる URL の
有効期限」）は最初から URL が複数になることを想定した名前になっており、そのまま使える。

サムネイルと原本の署名はそれぞれ独立に `ObjectStorageUnavailableError` を捕捉する
（`mappers.to_pin_photo_read()`）。片方だけ失敗してももう片方は返す。

原本の EXIF（BK-10）については、閲覧できるのは地図の member だけ（招待機能 BK-7 までは
ユーザー本人だけ）であることに変わりはないため、「BK-10 は BK-7 の前提」という ADR 本文の
整理は変わらない。原本 URL を配り始めた後も、この前提（member 以外には配らない）で
安全性を担保する。

### 決定17: 写真全件のページングは新設の `PinPhotoPageRead {items, photo_count, next_cursor}`

既存の `PinPhotoListRead`（`POST /pins/{id}/photos` の応答）は `next_cursor` を持たせる
意味が無いため、`GET /pins/{pin_id}/photos` 専用のスキーマを別に用意した。`(position, id)`
の keyset ページング（`core/pagination.py` に `encode_position_cursor`/`decode_position_cursor`
を追加）。`position` は一意制約ではないため、`id` を補助キーにして並びを安定させる。
既定 limit は30・最大100（一覧の既定50・最大200より小さい。写真グリッドは1ページの
表示件数が少ないため）。

### 決定18: 閲覧 API はストレージ未構成・障害時も 503 にせず、URL を null にする

既存の `to_pin_photo_read()` が `thumbnail` を既にこう扱っている（「生成待ち・ストレージ
不調は null」、決定6）ため、`original_url` も同じ扱いに揃えた。ピンの名前・位置・タグと
いった写真以外の情報は DB だけで返せるため、ストレージが理由で閲覧 API 全体を止める理由が
無い（`POST /pins` 等の書き込み系 API は決定8のとおり 503 のまま。写真を実際に確定させる
処理はストレージに依存するため区別する）。

### 検索条件（`q`・`tags`）について

Plane の本チケットは「bbox 等の絞り込み条件付き」の閲覧 API を要求しており、SS-120
（mobile の検索タブ）が使う backend 側の検索 API を置く場所が他に無かったため、`q`
（名前・メモ・タグの部分一致、ILIKE + `pg_trgm` 無しの素朴な実装）と `tags`（複数指定は
AND、`tag_key()` による正規化後の完全一致）を本チケットで実装した。マイグレーションは
不要（既存の `pins`/`pin_tags` テーブルの列だけで実装できる）。

一覧の総件数（`total_count`）は返さない。keyset ページングのたびに追加の `COUNT` クエリが
要ることに対し、地図表示では使わないため。検索タブの「N 件のピン」表示は読み込んだ件数で
代替する運用とし、必要になれば SS-120 で optional field として `total_count` を追加する
（expand）。同様に、閲覧しているユーザーの role・編集可否も本チケットの応答には含めない
（権限マトリクスは BK-5 の範囲。MVP は owner のみのため、mobile は `created_by_user_id` と
自分の ID を比較すれば足りる）。**（SS-112 で決定19・24 に置き換え。BK-5 は実装済みで、
role・操作可否を応答に含めない方針も決定24として確定した）**

### 一覧の必須パラメータ・並び順・件数上限

- **`sanpo_map_id` は必須にした。** 任意のパラメータを後から必須にすると破壊的変更になるが、
  必須を任意に緩めるのは互換を保てる（expand）。MVP ではユーザーごとに地図は実質1つで、mobile は
  `GET /sanpo-maps` で既定の地図の ID を取れる。地図をまたいだ検索が必要になったら任意に変え、
  省略時は「member であるすべての地図」を対象にする。
- **並び順は `created_at DESC, id DESC` の keyset ページング、limit は既定50・最大200。**
  既存のインデックス `ix_pins_sanpo_map_id_created_at_id` と walks の keyset の仕組み
  （`core/pagination.py`）をそのまま使える。地図表示では1画面の全件を出したいので、walks の
  最大50より大きくした。200件 × 署名2回（サムネイル・原本）でも presigned URL の生成は
  ローカルの計算だけで済み、応答時間の予算内に収まる。
- **bbox を指定しても並びは作成日時の新しい順のまま**（「範囲内で近い順」などにはしない）。
  表示範囲のピンが limit を超えると、古いピンは `next_cursor` 側に回り、地図上では最近作った
  ピンに偏って見える。ページングを続けるかクラスタ表示にするかといった見せ方は、mobile の
  地図表示（SS-118）で決める。backend 側で別の並び順が必要になったら、そのときに追加する。

### スコープ外にしたもの

- **検索タブのタグ候補（地図内のタグの一覧・使用回数）を返す API**（例:
  `GET /sanpo-maps/{id}/tags`）は本チケットに含めない。検索タブ（SS-120）で必要になったら
  別に切る。`pins → sanpo_maps` の依存の向きに合わせ、実装は `pins/` 側に置く想定。

### 将来の課題

- 1つの地図のピンが数千件を超えると、bbox 絞り込みが `(sanpo_map_id, created_at, id)`
  インデックス上で行を読み飛ばしながらのフィルタになり、遅くなりうる。MVP の規模
  （1ユーザー数百件程度）では問題にならない。遅くなったら `(sanpo_map_id, latitude,
  longitude)` の B-tree か PostGIS/GiST インデックスを検討する。
- `q` の `ILIKE '%…%'` はインデックスが効かない。地図単位で絞ったあとに評価されるため
  MVP では問題にならないが、必要になったら `pg_trgm` の導入を検討する。

## 追補（2026-09-25, SS-112 編集・削除 API）

BK-5（編集・削除 API と決定2の権限マトリクスの実装）を実装した。ADR 本文（決定1〜18・
SS-111 追補）が決めていなかった点について、SS-112 の実装で決めた事項をここに記録する。

### 決定19: 権限マトリクスの確定

行為者は「リクエストユーザーとピンの関係」で分類する。ピンが属する地図の
`sanpo_map_members` 行（role）と、対象ごとの作成者カラムで判定する。

| 操作 | 地図 owner | editor（対象の作成者本人） | editor（作成者ではない） | 非メンバー / 存在しない ID |
|---|---|---|---|---|
| ピン本体の更新（`name`・`memo`） | ○（他人のピンも可） | ○ | **403** | **404** |
| ピンの削除 | ○（他人のピンも可） | ○（※1） | **403** | **404** |
| タグの追加（`add_tags`） | ○ | ○ | ○ | **404** |
| タグの削除（`remove_tag_ids`） | ○（他人のタグも可） | ○（自分が付けたタグ） | 自分が付けたタグだけ。他人のタグを含むと **403** | **404** |
| 写真の追加（既存, 決定5） | ○ | ○ | ○ | 404 |
| 写真の削除 | ○（他人の写真も可） | ○（自分がアップロードした写真） | 自分がアップロードした写真だけ。他人の写真は **403** | **404** |

決定2の表を実装内容で置き換える（決定2の表は「予定表」だったため）。表の読み方・実装上の
注意:

- **「対象の作成者本人」は操作ごとに対象が違う**: ピンなら `pins.created_by_user_id`、
  タグなら `pin_tags.created_by_user_id`、写真なら `pin_photos.uploaded_by_user_id`。
  タグの削除の「作成者」は**タグの作成者**であり、ピンの作成者ではない（決定2が
  `pin_tags.created_by_user_id` を「権限マトリクスの材料」として別に持たせているのは、
  ピン作成者を指すならこの列が不要だったはずという理由による解釈）。
- **写真の削除はアップロード者本人 + owner**。ピン作成者の editor でも、他人がアップロード
  した写真は削除できない。容量はアップロード者に計上される（決定7）ため、写真の持ち主は
  アップロード者と見るのが一貫している。
- **owner は他人のピン・タグ・写真も操作できる**（表のとおり）。MVP の実データは招待
  （BK-7）が未実装のため owner しか存在せず、editor の分岐は現状テストでのみ通る。
- **※1: editor が自分のピンを削除すると、他のメンバーがそのピンに付けた写真・タグも
  `ON DELETE CASCADE` で消える。** ADR の「ピンの削除は作成者本人」をそのまま実装した
  結果で、ピン単位の削除である以上避けられない。
- 実装は `sanpo_maps/permissions.py` の純粋関数で、形は2種類ある
  （2026-09-26 追補, PR #101 レビュー対応）。
  - **追加系**（`can_add_pin`/`can_add_pin_photo`/`can_add_pin_tag`）: `role in {"owner",
    "editor"}` のみで判定する。作成者は判定しないので `is_creator` 引数は持たない。
  - **対象の持ち主を判定する更新・削除系**（`can_update_pin`/`can_delete_pin`/
    `can_delete_pin_tag`/`can_delete_pin_photo`）: `role == "owner" or (role in {"owner",
    "editor"} and is_creator)`。写真だけは `is_uploader`。
  - どちらも未知の role は False にする（fail-safe）。`is_creator`/`is_uploader` は
    キーワード専用引数にし、取り違えを防ぐ。

### 決定20: `PATCH /pins/{id}` はフィールド単位の部分更新とタグの差分（`add_tags`/`remove_tag_ids`）

- `name`・`memo`・タグの追加・削除を1つの `PATCH /pins/{pin_id}` にまとめ、1リクエストで
  原子的に反映する。タグ専用のエンドポイントは作らない。
  - 理由: 編集画面の「保存」1回を1リクエストにでき、途中で失敗しても一部だけ反映された
    状態にならない。タグは1ピン最大10件と小さいため、差分を1リクエストに載せても重くない。
- タグは**全置換ではなく差分**（`add_tags`: ラベルの配列、`remove_tag_ids`: `PinTagRead.id`
  の配列）で送る。全置換を採らなかった理由:
  - 共同編集で、他のメンバーが同時に足したタグを消してしまう（lost update）を避けるため。
  - 削除権限はタグごとに違う（決定19）。全置換にすると、サーバーが差分を推測したうえで
    権限判定することになり、エラーの理由が分かりにくくなる。
  - 差分形式なら再送しても結果が変わらない（追加済みはスキップ、削除済みは無視）ため、
    mobile の再試行が安全になる。
- `PinUpdate` は `model_config = ConfigDict(extra="forbid")`。`location`/`sanpo_map_id` 等を
  送って「変更されたつもり」になる事故を防ぐため（既存の `PinCreate` は forbid にしていない
  が、PATCH は「送ったものだけが変わる」という意味を持つため区別する）。
- 権限は**「リクエストに含まれるフィールド」に対して判定する**。値が現在と同じでも `name`
  を送れば「名前の更新権限」が必要になる（`model_fields_set` で判定。省略と明示的な `null`
  も同じ仕組みで区別する、`PinCreate.sanpo_map_id` と同じ）。**1つでも権限が無ければ全体を
  403 にし、何も反映しない**（部分適用しない）。
- 適用順序は「削除 → 追加 → 件数チェック」。適用後にタグが `PIN_TAGS_MAX_COUNT`（10件）を
  超えるなら、commit せずに **409 `code: "tag_limit_exceeded"`** を返す（新スキーマ
  `PinTagConflictErrorRead`。既存の `PinConflictErrorRead.code` の enum は広げない。理由は
  他エンドポイントの契約や mobile の網羅的な分岐への影響を避けるため）。**タグの権限チェック
  もこの適用順序に揃え、`remove_tag_ids` → `add_tags` の順で行う**（決定19の表は操作の
  一覧であり、チェック順を表すものではない。実装（`pins/service.py::update_pin`）の
  チェック順・適用順を一致させることで、コードを読む際に「チェックした順に適用される」と
  素直に読めるようにするための整理で、権限マトリクス自体（決定19）に変更はない）。
- 同じラベルを「削除」と「追加」の両方に含めた場合は、削除してから追加し直すことになる
  （結果として作成者が付け替わる）。仕様として許容する。
- 空のボディ `{}` も 200 で受け付け、何も変えずに `PinRead` を返す（`updated_at` も更新しない）。
- 更新できるのは `name`/`memo`/タグのみ。`location`/`sanpo_map_id`/`client_walk_id` は対象外
  （SS-119 の要件に含まれない。地図間の移動は権限の意味が変わるため別途設計が要る）。

### 決定21: 404 と 403 の使い分け（IDOR 対策の継続）

- **非メンバー・存在しない `pin_id` は 404**（`Pin not found`）。取得は必ず
  `get_for_member_for_update()`（`user_id` 必須の JOIN）を通す。決定9と同じ設計。
- **メンバーだが権限がない場合は 403**（`Permission denied`）。メンバーは `GET /pins/{id}`
  でピンの存在を既に知っているため、403 にしても新たな情報は漏れない。mobile は
  「権限がない」と「既に消えている」を区別して表示できる。
- **写真**: `photo_id` が「そのピンに属していない」「存在しない」場合は、どちらも 404
  （`Pin photo not found`、新設の `PinPhotoNotFoundError`）。写真は
  `WHERE pin_id = :pin_id AND id = :photo_id` で取得し、ID だけで引く経路は作らない。
  ピンの member 判定を先に行うため、非メンバーは写真の有無にかかわらず `Pin not found` になる。
- **タグ**: `remove_tag_ids` の中でこのピンに属さない ID は黙って無視する（404 にしない）。
  同時削除や再送で「既に消えた」タグを 404 にすると、PATCH の原子性のせいで他の変更まで
  失敗してしまうため。他のピンのタグは `pin_id` で絞るので、消されることも存在を推測される
  こともない（応答は常に同じ）。
- **削除済み ID への `DELETE` の再送は 404**（`DELETE /walks/{id}` と同じで、冪等にはしない）。
  mobile は 404 を「既に存在しない」として成功と同じに扱ってよい。
- 判定の順序: 認証（401） → ボディのバリデーション（422） → member 判定（404） →
  写真の存在（404） → 権限（403） → タグ件数（409）。

### 決定22: 削除時の S3 は「DB commit → best-effort の即時削除」

- 手順: (1) `pins` 行を `FOR UPDATE` でロックする → (2) 消す写真の `s3_key`/
  `thumbnail_s3_key` を列だけ SELECT して集める → (3) DB 行を削除して commit する →
  (4) S3 の原本・サムネイルを best-effort で削除する（失敗したら WARNING ログを出し、
  204 のまま返す）。
- この順序にする理由: 決定4の不変条件（DB が存在しない S3 オブジェクトを指さない）を守る
  ため。S3 を先に消して DB の commit に失敗すると、DB が消えた写真を指す状態になる。逆に
  DB を先に消して S3 の削除に失敗しても、残るのは「DB から参照されない S3 オブジェクト」
  だけになる。これは決定4ですでに許容済みの不整合で、容量は DB 集計なので利用者の容量は
  すぐに空く。
- 遅延削除（削除予定の行を作って後で掃除する）は採用しない。掃除の仕組み（BK-3）が
  未実装で、今作ると別の仕組みが増えるため。即時削除でも失敗時に残る不整合は同じ種類
  なので、BK-3 の掃除でまとめて回収できる。
- **ストレージが Unconfigured・障害中でも、削除 API は 503 にしない**（DB 削除だけ成功
  させる）。決定18（閲覧系は 503 にしない）と同じ考え方で、写真以外のデータの操作を
  ストレージの状態で止めない。OpenAPI の `responses` にも 503 を宣言しない。
- **ピンの削除では写真が数百枚ありうる**（枚数は無制限）。1件ずつ `delete()` すると
  Lambda の時間予算を食い潰しうるため、`ObjectStorage` に **`delete_many(keys: list[str])
  -> list[str]`**（削除に失敗したキーを返す）を追加した。
  - S3 実装は `delete_objects`（1回あたり最大1000キー、`Quiet=True`）でチャンクに分けて
    呼び、応答の `Errors` を失敗キーとして返す。`ClientError`/`BotoCoreError` はそのチャンク
    全体を失敗扱いにし、ログを出してから次のチャンクへ進む（例外を投げるのは Unconfigured
    のときだけ）。IAM の実行ロールは `s3:DeleteObject` のまま（`DeleteObjects` API も IAM
    アクションは `s3:DeleteObject` なので、追加の権限は要らない）。
  - 時間予算は締め切り（`PhotoAttacher.cleanup_staging()` と同じ `monotonic()` 基準）で
    守る。超えたら残りを諦めて WARNING を出す（判定条件は 2026-09-26 の追補で変更。下記）。
    新設の設定値 `PIN_PHOTO_DELETE_DEADLINE_SECONDS`（既定10秒、上限20秒）で指定する。
  - Fake 実装は `delete()` をループするだけ。Unconfigured 実装は
    `ObjectStorageUnavailableError` を投げる（呼び出し側が捕捉してログを出す）。
  - 写真1枚の削除（キー2つ）も同じ `delete_many()` を使う（経路を1つにする）。
  - **（2026-09-26 追補, PR #101 レビュー対応）締め切りを「呼ぶ前だけ」確認するのでは
    不十分だった**: 呼び出し中の S3 の時間が予算に入らない。旧設定（3回試行 ×（2 + 5）秒 +
    バックオフ）では、1回の `delete_many` チャンクが 21 秒を超えうる。締め切り直前に次の
    チャンクを始めると Lambda の 29 秒を超え、DB は commit 済みなのに 504 が返りうる
    （Copilot レビュー, PR #101）。
    - そこで、削除（`delete`/`delete_many`）は**削除専用の client**で呼ぶ。この client は
      再試行なし（`total_max_attempts=1`）で、timeout は短め
      （`OBJECT_STORAGE_DELETE_CONNECT_TIMEOUT_SECONDS` 既定1秒・
      `OBJECT_STORAGE_DELETE_READ_TIMEOUT_SECONDS` 既定5秒）。1回の最悪時間は
      connect + read（既定6秒）になる。best-effort なので、再試行を減らしても孤立が
      増えるだけ（BK-3 で回収）。単発の `delete()` を使う staging の後始末
      （`PhotoAttacher.cleanup_staging()`、アップロード枠の取り消し）も同じ削除専用
      client を使うため、こちらも1回の呼び出しが有界になる副次効果がある。ただし
      `cleanup_staging()` 自身は「締め切りを呼び出し前にだけ確認する」構造のままで、
      直していない（次項の確定処理と同じ理由）。
    - 最初のチャンクは残り時間によらず必ず試みる。2つ目以降は「残り時間 ≥ 1回の最悪
      時間」のときだけ始める。この判定により、S3 の後始末フェーズ全体は
      `max(締め切り, 1回の最悪時間)` 以内に終わる。
    - 起動時に「締め切り + 1回の最悪時間 ≤ 25 秒」を検証する（env を問わず。Lambda の
      29 秒から、削除フェーズより前の DB 処理と近似誤差の分として 4 秒の余裕を取る）。
    - 近似の限界: botocore の read timeout は「無通信の時間」の上限であり、1回の応答
      全体の上限ではない。DNS 解決（`getaddrinfo`）も timeout の対象外。
    - 削除処理をリクエストの外へ移す案（EventBridge スケジュール + 別 Lambda 等）も
      Copilot から提案されたが、今回のスコープには含めない（別チケットで検討する）。
    - 確定処理の締め切り（`PIN_PHOTO_CONFIRM_DEADLINE_SECONDS`）と `cleanup_staging()`
      には、どちらも同じ構造（呼ぶ前だけ確認）が残っているが、確定処理は 503 で再送すれば
      回復する設計のため、今回は直さない。
- `pin_photo_uploads` の `attached` 行は削除しない（ピンへの参照を持たず、容量計算にも
  使われない）。削除した写真の `upload_id` を `POST /pins/{id}/photos` で再送した場合は、
  従来どおり `status != pending` で 409 `photo_upload_not_ready` になる。
- 孤立した `original/`・`thumb/` オブジェクト（S3 削除の失敗・締め切り超過で残るもの）は
  BK-3 の定期掃除でまとめて回収する対象に追加した。

### 決定23: `updated_at` はピン本体とタグの変更でだけ更新する

`Pin.updated_at` は、`name`/`memo`/タグのどれかが**実際に変わった場合だけ**、注入した
`now()` で更新する（`onupdate` は使わない。`sanpo_maps.touch()` と同じく明示的に更新する）。
写真の削除では `Pin.updated_at` を更新しない（写真の追加でも更新していないので、それに
揃える）。地図の `mark_used()` も呼ばない（ピンの追加・写真の追加のときだけ呼ぶ）。

### 決定24: 閲覧者の role・操作可否は応答に含めない

`PinRead` などに `role` や `can_edit` を足さない。MVP の実データは owner しかおらず
（招待 BK-7 が未実装）、mobile は「常に全操作可」で SS-119（mobile 側の編集・削除）を
実装できる。role の露出方法は招待で editor が生まれるときに決めるほうが要件がはっきりする。
追加は後方互換な expand でできる。それまでに editor が権限のない操作をしても 403 が
返るので、安全性は変わらない。

### mobile（SS-119）への伝達事項

- PATCH には**変更したフィールドだけ**を送る。`name`/`memo` を消すときは `null`
  （空文字列でもよい）。
- タグは差分で送る: 追加は `add_tags`（ラベル）、削除は `remove_tag_ids`（`PinTagRead.id`）。
  再送しても安全。
- 応答の `PinRead` でキャッシュを置き換えられる（`GET /pins/{id}` と同じ形）。
- 409 `code: "tag_limit_exceeded"` → 「タグは10件まで」と表示する。
- 403 → 権限がない（MVP では発生しない想定）。404 → 既に削除されている（一覧から取り除く）。
- 写真の削除は1枚ずつ `DELETE /pins/{pin_id}/photos/{photo_id}` を呼ぶ。204 または 404
  なら成功扱いにしてよい。削除後は `photo_count` や代表写真が変わるので、ピンの詳細・
  一覧のキャッシュを無効化する。
- `DELETE /pins/{id}` の 204/404 は、どちらも一覧から取り除いてよい。

## 追補（2026-09-26, SS-118: 地図表示で limit を超えたときの見せ方の決着）

「地図表示で `limit` を超えたときの見せ方（ページングを続けるか、クラスタ表示にするか）は
SS-118 で決める」（本文「一覧の必須パラメータ・並び順・件数上限」）を決着させた。

- **決定: ページングを続けず、1リクエスト（`limit=200`。地図ごと）で打ち切り、mobile の
  `/pins/map` では「一部だけ表示。拡大すると他も出る」と案内する。クラスタ表示は採らない**
  （詳細・理由は mobile [ADR-012](../../packages/mobile/adr/ADR-012-pin-map-display-and-detail.md) D3）。
  backend 側の変更は無い（本追補は「決まった」ことの記録のみ）。
- mobile は地図ごとに `GET /pins` を並列に呼んでマージする（`sanpo_map_id` 必須のまま。
  ADR-012 D4）。地図数が増えて往復が問題になったら、本文「一覧の必須パラメータ・並び順・件数
  上限」が予告している `sanpo_map_id` 任意化の expand を検討する（今回は依頼しない）。

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
- Plane: SS-88（本 ADR）、SS-106/SS-107（infra, S3 バケット・境界）、SS-111（閲覧 API, BK-4）、
  SS-112（編集・削除 API, BK-5）、SS-118（mobile: 地図表示・詳細画面。[mobile ADR-012](../../packages/mobile/adr/ADR-012-pin-map-display-and-detail.md) D3・D4）
