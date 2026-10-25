# walkshare と dev からのデータ移行（一回限り）

旧アプリ walkshare の地図と、dev 環境にある地図を、本番（prod）の地図に移すための設計メモ。
スクリプトとこの README は移行が終われば消す（Plane SS-242。[知識の置き場所ガイドライン](../../../../docs/knowledge-management.md)の「一回限りの作業の設計」）。
ADR・docs・agent-memory からこの README にリンクしない。

- この README は git の履歴に残る。**個人のデータ（ニックネーム・ユーザー ID・タイトルやメモの本文・旧アプリの ID）を書かない。**
  件数は「本人のアカウント」の分として書く。テストのデータも手で作ったものだけを使う。
- 課題: SS-235（この設計）、SS-236（写真の容量の上限を 10GiB に）、SS-237（読み込み）、SS-238（walkshare の書き出し）、
  SS-239（sanposcape の地図の書き出し）、SS-240（local での予行・dev への投入）、SS-241（dev → prod）、SS-242（後片付け）。

## 全体の流れ

```
walkshare（Firestore のダンプ + GCS の原本）─ 書き出し（SS-238）─→ バンドル ─ 読み込み（SS-237）─→ local / dev の地図
dev の地図（DB + S3）──────────────────────── 書き出し（SS-239）─→ バンドル ─ 読み込み（SS-237）─→ prod の地図
```

- 書き出しと読み込みを分け、間を「バンドル」（下の形のディレクトリ）でつなぐ。dev と prod は AWS アカウントも DB の接続先も別なので、
  書き出しは dev の資格情報（読み取りだけ）、読み込みは prod の資格情報だけで行い、両方を同時に持たない。
- prod に書くのは「dev の地図 → バンドル → prod の地図」の経路だけ。walkshare のデータも dev に入れて確かめ・手直ししてから、この経路で prod に入れる。
- 読み込みは1つで、2つの書き出しの両方から使う。DB と S3 に直接書く（公開 API は使わない。旧データの日付を残すため）。

## バンドルの形（format_version 1）

```
<bundle>/
  manifest.json
  pins.json
  photos/<写真の source_id>.jpg
```

日時はすべて UTC の ISO 8601（`2022-03-09T01:23:45.000000Z`）。

### manifest.json

| キー | 内容 |
| --- | --- |
| `format_version` | `1`。読み込みは知らない版を拒否する |
| `source` | `{"kind": "walkshare" \| "sanposcape", "environment": "dev" など（sanposcape のとき）, "map_id": 書き出し元の地図の ID}` |
| `exported_at` | 書き出した日時 |
| `counts` | `{"pins", "photos", "tags"}` の件数 |
| `photo_bytes_total` | 写真の `byte_size` の合計 |
| `pins_sha256` | `pins.json` の sha256（16進） |

### pins.json

```json
{
  "pins": [
    {
      "source_id": "書き出し元のピン（スポット）の ID",
      "name": "50文字以内。空なら null",
      "memo": "1000文字以内。空なら null",
      "latitude": 35.0,
      "longitude": 139.0,
      "visited": true,
      "archived": false,
      "created_at": "...Z",
      "updated_at": "...Z",
      "tags": [
        {"label": "正規化・重複除去済みのラベル（10件まで、各20文字まで）", "created_at": "...Z"}
      ],
      "photos": [
        {
          "source_id": "書き出し元の写真の ID",
          "file": "photos/<source_id>.jpg",
          "position": 0,
          "taken_at": "...Z または null",
          "created_at": "...Z",
          "byte_size": 495000,
          "width": 2048,
          "height": 1536,
          "sha256": "16進"
        }
      ]
    }
  ]
}
```

- `position` はピンの中で 0 からの連番（元の並び順）。
- タグは `ORDER BY created_at, id` で返り、mobile はその順に並べる。タグの `created_at` が同じだと並びが uuid5 の `id` で決まり、元の順にならないので、タグごとに `created_at` を持たせる。
- 作成者・アップロード者は入れない（環境ごとにユーザーの ID が違う）。読み込み時に指定したユーザーにする。
- 散歩との紐付け（`client_walk_id`）は入れない（散歩は移さない。読み込みでは null）。
- サムネイルは入れない。読み込みが `sanpo_maps/photos/thumbnails.py` で作る（作り方を1か所にする）。
- 写真は処理済みの原本（長辺 2048px 以内の JPEG、メタデータなし）。読み込みでも `jpeg_metadata.py` の除去をもう一度通す（無劣化なので二度かけても同じ）。

## ID の決め方（読み込みが作る）

読み込みが uuid5 で作る。名前空間は `3d38bef8-cb3f-416a-a856-7a9c78cb43bd`（この移行専用。変えない）。

| 列 | uuid5 の名前 |
| --- | --- |
| `pins.id`・`pins.client_pin_id` | `{source.kind}:{移行先の地図 ID}:pin:{ピンの source_id}` |
| `pin_photos.id` | `{source.kind}:{移行先の地図 ID}:photo:{写真の source_id}` |
| `pin_photos.upload_id`（S3 のキーに入る） | `{source.kind}:{移行先の地図 ID}:upload:{写真の source_id}` |
| `pin_tags.id` | `{source.kind}:{移行先の地図 ID}:tag:{ピンの source_id}:{label_key}` |

- 同じバンドルを同じ地図に何度読み込んでも同じ ID になる（冪等）。既にある行は飛ばし、S3 は同じキーに上書きする。
- 移行先の地図 ID を名前に入れるので、同じバンドルを別の地図に読み込んでも ID はぶつからない。
- ULID をそのまま UUID にする案は採らない。version / variant のビットが RFC 9562 に沿わず、将来どこかで厳しい UUID の検証を入れると、移したピンだけ弾かれうる。
- `client_pin_id` を `pins.id` と同じ値にするので、`(created_by_user_id, client_pin_id)` の一意制約が二重登録の歯止めになる。
- walkshare → dev → prod と2回移すと、prod の ID は dev の ID から作られる（walkshare の ID から直接は作られない）。

## 接続先の取り違えを防ぐ（読み込み・書き出しの共通）

`Settings` は `.env` を読むので、prod の DSN だけを環境変数で渡すと、ローカルの `.env` の `ENV=local`・`STORAGE_MODE=fake` が混ざる。
そのまま走ると、prod の DB に行を書きながら写真を手元の fake storage に書き（prod の写真が壊れ、本物の写真が手元の別の場所に残る）、
`ENV=local` なので本番向けの設定の検証も走らない。

- `--target local|dev|prod` を必須の引数にする。
- local 以外では `.env` を読まない（`Settings(_env_file=None)`）。スクリプト用の検証で、`storage_mode == "real"`・バケット名・バケットのリージョン・`database_dsn` が設定されていることを確かめる。
  既存の `_validate_environment_settings` は使わない（`ENV=production` にすると `AUTH_JWT_SECRET`・`GOOGLE_MAPS_SERVER_API_KEY` など移行に要らない本番の秘密情報まで必須になり、
  エージェントが動かすプロセスに渡すことになる）。`Settings` の必須項目で移行に要らないものは、既知のダミーの値で埋める。
- 書く前に、接続先の DB のホスト名とバケット名を表示し、確認の入力を求める。
- 書き出し（SS-239）は読み取り専用で接続する（`default_transaction_read_only=on`、または読み取り専用のロール）。

## スクリプトの出力

後続ではエージェントがスクリプトを実行し、出力が会話の記録に残る。出力（ログ・エラーの文言・`--dry-run` の結果）は
件数・容量と、新しい ID（uuid5）またはバンドルの中の連番だけにする。ピンの名前・メモ・座標・タグ・旧アプリの ID・ユーザーの ID は出さない。

## 読み込み（SS-237）

- 引数: `--target`、バンドルのパス、移行先の地図 ID、作成者にするユーザー ID、`--dry-run`。
- 移行先の地図は、アプリで新しく作ってから ID を渡す（読み込みは地図を作らない）。戻すときはアプリで地図ごと消せる。
- 書く前に確かめて、1つでも外れたら何も書かずに止める:
  - `format_version`、`pins.json` と各写真の sha256
  - 移行先の地図があり、指定したユーザーがその owner であること
  - 各値が API の契約の範囲に収まること（名前 50 文字、メモ 1000 文字、タグは `tag_labels.dedupe_tags` を通して 10 件・20 文字まで、写真は JPEG で `pin_photo_max_bytes`・`pin_photo_max_pixels` 以内、`file` が `photos/{source_id}.jpg` と完全に一致し、symlink でないこと）
  - バンドルのパスがリポジトリの `tmp/walkshare-migration/` の中にあること（対応表をバンドルの横に書くため）
  - 容量: `PinPhotoUploadRepository.acquire_user_lock` を取ったうえで、`sum_attached_bytes` + `sum_reserved_bytes`（アプリで先行アップロード中の枠）+ まだ入っていない写真の合計 ≤ `pin_photo_user_quota_bytes`。
    写真の大きさはバンドルの申告ではなく、メタデータを除いた後の実際のバイト数で数える（`pin_photos.byte_size` にもその値を入れる）
- 書くもの: `pins`（`created_by_user_id` は指定したユーザー、`client_walk_id` は null）、`pin_tags`（`created_at` はバンドルの値）、
  写真は1枚ずつ メタデータ除去 → サムネイル → S3（`photo_keys.original_key` / `thumbnail_key`。`staging/` は通さない）→ `pin_photos`。
- `--dry-run` は書かずに、入る件数・飛ばす件数・容量を出す。
- 対応表（元の ID → 新しい ID・S3 のキー）をバンドルの横に書き出す（戻すときと照合に使う）。ディレクトリは 0700・ファイルは 0600 でスクリプトが作る。
- S3 に置いた後で DB に書く前に止まると、どの行からも参照されない原本が残る（`staging/` を通さないのでライフサイクルでも消えず、地図の削除でも消えない）。
  再実行すれば同じキーに上書きして行も入る。やめる場合は、対応表のキーで消す。
- **未決（SS-237 で確かめる）**: `pin_photo_uploads` の行を作るか（作らない予定。掃除の処理・アカウント削除が `pin_photos` と S3 の `original/pins/<user_id>/`・`thumb/pins/<user_id>/` だけで足りるかを確かめる）。

## walkshare の書き出し（SS-238）

入力は Firestore のダンプ（地図・スポット・写真・名前）と GCS の原本。

### 移す範囲（2026-10-25 ユーザー決定）

- 本人のアカウントが作ったスポットと、作成者の記録が無いスポット（walkshare が作成者を記録し始める前のもの）を移す。もう1つのアカウントが作ったスポットは移さない。
  本人のアカウントの uid は書き出しの引数で渡す（ここには書かない）。
- 移すスポットに付いた写真は、アップロードしたアカウントに関わらずすべて移す。どのスポットからも参照されない写真は移さない。
- 件数: ピン 647（写真なし 89）・写真 1,979・タグの付くピン 48（1ピン最大 4）。

### マッピング

| sanposcape | walkshare | 備考 |
| --- | --- | --- |
| `name` | `spot.title` | 前後の空白を除く（4件が該当）。空なら null。最大 33 文字 |
| `memo` | `spot.comment` | 空なら null（539件が該当） |
| `latitude`・`longitude` | `spot.point` | |
| `created_at` | `spot.date` | 全件ある |
| `updated_at` | max(`created_at`, `spot.last_visited`, 写真の `created_at`) | `last_visited < date` が 6件あるため max を取る |
| `visited` | 常に true | walkshare のスポットは訪れた場所の記録で、`last_visited` が全件ある |
| `archived` | 常に false | |
| `tags` | 写真の `name` → `names.name` | ピンの写真の順に集め、`tag_labels` で正規化・重複除去。最大 5 文字・1ピン最大 4 件。`created_at` はピンの `created_at` + i マイクロ秒（i は 0 からの順番。この順に並ぶ） |
| 写真の並び | `spot.photos` の順 | `position` は 0 からの連番 |
| 写真の `taken_at` | `photo.date` | null が 57 枚 |
| 写真の `created_at` | max(ピンの `created_at`, `taken_at`) | `taken_at` が null ならピンの `created_at`。1,979 枚のうち 1,326 枚はスポットの作成より後に撮られている（再訪で足した写真） |

捨てるもの: `spot.score`、`names` の読み・場所・メモ・顔写真、`maps/<地図名>/faces/`・`_cache/` の画像、作成者・アップロード者の uid。

### 写真の処理

- GCS から1枚ずつメモリに取り、EXIF の向きを画素に反映 → 長辺 2048px に縮小（LANCZOS）→ JPEG 品質 70 で保存（メタデータは付けない）。mobile の再圧縮（長辺 2048px・品質 0.7）に合わせる。
- 原本は手元に残さない。処理済みの JPEG だけをバンドルに書く。バンドルにあり sha256 が合う写真は飛ばす（途中から再開できる）。

### 容量の見積もり（2026-10-26）

移す範囲から無作為に 40 枚を選び、上の処理で再圧縮した。

| | 原本 | 再圧縮後 |
| --- | --- | --- |
| 長辺 | 全件 4032px | 2048px |
| 1枚の大きさ | 中央値 2,460KiB・平均 2,715KiB | 中央値 447KiB・平均 484KiB（210〜967KiB） |

- 1,979 枚で **0.9〜1.0GiB**。再圧縮後の平均 × 枚数で約 935MiB（0.91GiB）、標本の大きさの比（約 18%）× 原本の合計（参照される写真の分で 5.70GiB）で約 1.0GiB。
  標本の原本は全体（1枚の平均 約 3,000KiB）より小さめに偏っているので、上の側に寄りうる。
- 1枚の最大は 1MiB に届かず、`pin_photo_max_bytes`（10MiB）に十分収まる。
- 容量の上限に数えるのは原本の `byte_size` だけで、サムネイルは数えない。1GiB の上限のままだと、walkshare の分だけで上限に届きうる。上限を 10GiB に上げる SS-236 を dev への投入（SS-240）の前に出す。

## sanposcape の地図の書き出し（SS-239）

- 入力は環境（dev）と地図の ID。DB と S3 は読み取りだけ。
- 写すもの: ピン（`name`・`memo`・位置・`visited`・`archived`・`created_at`・`updated_at`）、タグ（ラベル・`created_at`）、写真（`position`・`taken_at`・`created_at`。原本は S3 の `original/` をそのまま。再圧縮しない）。
- 写さないもの: 作成者・アップロード者、散歩との紐付け、サムネイル（読み込みで作り直す）。
- 地図に複数のユーザーのピンがあっても、すべて書き出し、読み込みで指定したユーザーのものにする。書き出しは作成者ごとの件数を出し、2人以上なら警告する（`--created-by` で絞れるようにする）。
- 往復の確かめ: local で書き出し → 別の地図に読み込み、元の地図と同じに見えることを確かめる。

## 個人のデータの扱い

- ダンプ・バンドル・対応表はリポジトリの `tmp/walkshare-migration/` の中にだけ置く（git の外。ディレクトリ 0700・ファイル 0600）。SS-242 で消す。
- local の予行（SS-240）で、本物のデータが local の DB（docker の volume）と fake storage（`packages/backend/storages/dev-storage`）にも入る。
  これも SS-242 で消す（移行先にした local の地図を消し、fake storage に残ったキーがないことを確かめる）。
- SS-242 では、対応表の S3 のキーと dev の S3 の `original/pins/<user_id>/`・`thumb/pins/<user_id>/` を突き合わせ、途中で止まった分の原本が残っていないことを確かめる。
- 移したデータは通常のピン・写真と同じテーブル・同じ S3 のキーに入り、地図の削除・アカウントの削除で同じように消える。
  アプリが扱うデータの種類・保存先・保存期間は変わらないので、データ取扱い台帳（`docs/privacy/data-inventory.md`）は変えない。
- dev に入れた walkshare の地図は、prod での確認（SS-241）の後に SS-242 で消す（本物の写真の複製を減らすため）。
- スクリプトとこの README を消した後も prod のデータに残る事実（作成日時がアプリの公開より前のピンがあること、ID が uuid5 であること、`client_walk_id` が null であること）は SS-242 で既存の ADR に追補する。
