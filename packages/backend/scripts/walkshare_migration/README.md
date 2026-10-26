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
書き出しが途中経過に使う `.` で始まるファイル（`.progress.jsonl`）は形に含めず、読み込みは見ない。

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
- タグは `ORDER BY created_at, id` で返り、mobile はその順に並べる。`created_at` が同じタグ（アプリで1回の保存で付けたタグはふつう同じになる）は
  `id` の順になるので、`created_at` を写すだけでは移行先で元の順にならない。そのため:
  - **`tags` の配列の順を正とする。** 書き出しは表示と同じ `(created_at, id)` の順に並べる。
  - 読み込みは、前のタグ以下の `created_at` を「前のタグの `created_at` + 1 マイクロ秒」に繰り上げ、配列の順に単調に増やしてから書く。
- 作成者・アップロード者は入れない（環境ごとにユーザーの ID が違う）。読み込み時に指定したユーザーにする。
- 散歩との紐付け（`client_walk_id`）は入れない（散歩は移さない。読み込みでは null）。
- サムネイルは入れない。読み込みが `sanpo_maps/photos/thumbnails.py` で作る（作り方を1か所にする）。
- 写真は処理済みの原本の JPEG。walkshare の書き出しでは長辺 2048px 以内・Exif なし（ICC は残す）に作り直す。sanposcape の書き出しは原本をそのまま入れるので、
  向きだけの Exif・ICC や、長辺 2048px を超える画像を含みうる（アプリの上限は大きさ 10MiB・4,000 万画素だけ）。読み込みは長辺を検証しない。読み込みでも `jpeg_metadata.py` の除去をもう一度通す（無劣化なので二度かけても同じ）。

## ID の決め方（読み込みが作る）

読み込みが uuid5 で作る。名前空間は `3d38bef8-cb3f-416a-a856-7a9c78cb43bd`（この移行専用。変えない）。

| 列 | uuid5 の名前 |
| --- | --- |
| `pins.id`・`pins.client_pin_id` | `{source.kind}:{移行先の地図 ID}:pin:{ピンの source_id}` |
| `pin_photos.id` | `{source.kind}:{移行先の地図 ID}:photo:{写真の source_id}` |
| `pin_photos.upload_id`（S3 のキーに入る） | `{source.kind}:{移行先の地図 ID}:upload:{写真の source_id}` |
| `pin_tags.id` | `{source.kind}:{移行先の地図 ID}:tag:{ピンの source_id}:{label_key}` |

- 同じバンドルを同じ地図に何度読み込んでも同じ ID になる（冪等）。既に行がある写真は、DB も S3 も書かずに飛ばす（バンドルを作り直してバイト列が変わっても、既存の行の大きさ・サムネイルと食い違わないように）。
  S3 に書くのは、これから行を入れる写真だけ（前回 S3 に置いて行を入れ損ねた分は、同じキーに上書きする）。
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
  エージェントが動かすプロセスに渡すことになる）。
- 値の有無だけでなく、`--target` と実際の接続先が合うことを確かめる（シェルに前の作業の環境変数が残りうるため）:
  バケット名が `--target` の環境の SSM（`/sanposcape/<env>/platform/pin_photos/bucket_name`。backend の `template.yaml` と同じ）の値と一致すること、
  STS の `get-caller-identity` のアカウントが `--target` の環境のアカウントであること。
- 書く前に、接続先の DB のホスト名とバケット名と件数を表示して止まる。ユーザーが表示を見てから、`--yes` を付けて実行し直す（エージェントが自分で確認に答えない）。
  ただし `--target local` は、書き先が手元の DB と fake storage だけなので、エージェントが表示を確かめて `--yes` を付けてよい（SS-237）。
- 書き出し（SS-239）は読み取り専用で接続する（`default_transaction_read_only=on`、または読み取り専用のロール）。

## スクリプトの出力

後続ではエージェントがスクリプトを実行し、出力が会話の記録に残る。出力（ログ・エラーの文言・`--dry-run` の結果）は
件数・容量と、新しい ID（uuid5）またはバンドルの中の連番だけにする。ピンの名前・メモ・座標・タグ・旧アプリの ID・ユーザーの ID は出さない。
walkshare の書き出しは、加えて写真の ICC プロファイルの説明（`Display P3` などの色空間の名前）ごとの枚数を出す（画像に埋め込まれた文字列だが、個人のデータではない）。

- 例外の文言にも値が入る（制約違反の DETAIL の `Key (...)=(...)`・`Failing row contains (...)` には、ユーザーの ID・タグ・名前・メモ・座標が入る。
  `hide_parameters` が隠すのは `[parameters: ...]` だけ）。例外はスクリプトの入口で捕まえ、型・SQLSTATE・制約の名前（`e.diag.constraint_name`）と
  バンドルの中の連番だけを出す。`str(e)` とトレースバックは出さない。
- DB には `settings.sqlalchemy_engine_kwargs` を通して接続し、`hide_parameters` を効かせる。アプリのロギングを使うなら `include_exception_messages` を False にする
  （`.env` を読まないと `ENV` が既定の `local` になり、例外の文言を出す設定になるため）。

## 読み込み（SS-237）

- 引数: `--target`、`--bundle`（バンドルのパス）、`--map-id`（移行先の地図 ID）、`--user-id`（作成者にするユーザー ID）、`--dry-run`、`--yes`、
  `--aws-account-id`・`--db-host`（dev・prod で、資格情報のアカウントと `DATABASE_DSN` のホスト名と照合する）。
- 移行先の地図は、アプリで新しく作ってから ID を渡す（読み込みは地図を作らない）。戻すときはアプリで地図ごと消せる。
- 書く前に確かめて、1つでも外れたら何も書かずに止める:
  - `format_version`、`pins.json` と各写真の sha256
  - 移行先の地図があり、指定したユーザーがその owner で、ほかのメンバーがいないこと（共有中の地図だと、移したピン・写真がほかの人に見える。SS-237）
  - 各値が API の契約の範囲に収まること（名前 50 文字、メモ 1000 文字、タグは 10 件までで、ラベルの列を `tag_labels.dedupe_tags` に通した結果が元の列と完全に一致すること（正規化済み・重複なし・20 文字まで。黙って落とすと `created_at` との対応がずれるので、違えば止める）、写真は JPEG で `pin_photo_max_bytes`・`pin_photo_max_pixels` 以内、`file` が `photos/{source_id}.jpg` と完全に一致し、symlink でないこと）
  - バンドルのパスが、`Path.resolve()` した後でリポジトリの `tmp/walkshare-migration/` の中にあること（対応表をバンドルの横に書くため）
  - 容量: `PinPhotoUploadRepository.acquire_user_lock` を取ったうえで、`sum_attached_bytes` + `sum_reserved_bytes`（アプリで先行アップロード中の枠）+ まだ入っていない写真の合計 ≤ `pin_photo_user_quota_bytes`。
    写真の大きさはバンドルの申告ではなく、メタデータを除いた後の実際のバイト数で数える（`pin_photos.byte_size` にもその値を入れる）
- トランザクションの単位（SS-237 で決定）: **ピンごとに1つ**。`acquire_user_lock` は `pg_advisory_xact_lock` で commit すると外れる。全体を1つのトランザクションにすると、
  約 2,000 枚の S3 の書き込みの間ロックを持ち続け、同じユーザーのアプリでの写真の枠の発行・確定が待たされて Lambda の時間切れになる。
  - 書く前に1回、ロックの中で全体の容量を確かめる（外れたら何も書かない）。
  - 書くときはピンごとに、ロック → このピンの写真の分で容量を確かめ直す → ピン・タグ・写真 → commit。ロックを持つのは1ピン分（walkshare の実データで最大 45 枚）の S3 の書き込みの間だけで、
    途中でアプリから写真を上げられても上限は超えない。それでも移行の間は、そのユーザーでアプリから写真を上げない（上げると、途中で容量の上限で止まりうる）。
  - 既にあるピン（ID は uuid5）は、タグ・写真ごと DB も S3 も書かずに飛ばす。ピンとその写真は同じトランザクションなので、ピンがあれば写真も入っている。
  - Neon のトランザクションの時間: dev（SS-240）では 647 ピン・1,979 枚で 23 分（1ピン平均約 2 秒）で、時間切れは起きなかった。
    スクリプトはピンごとの経過を出さないので、1ピン目の時間は測れない。1ピン分が時間切れになればそのピンで止まり、それまでに書いたピンは残る（再実行で続きから入る）。
- 移行先の地図の `updated_at` は、ピンを入れたら最後に1回更新する（アプリでピンを足したときの `mark_used` と同じ。地図の一覧の並びに効く）。
- 書くもの: `pins`（`created_by_user_id` は指定したユーザー、`client_walk_id` は null）、`pin_tags`（`created_at` はバンドルの値）、
  写真は1枚ずつ メタデータ除去 → サムネイル → S3（`photo_keys.original_key` / `thumbnail_key`。`staging/` は通さない）→ `pin_photos`。
- `--dry-run` は書かずに、入る件数・飛ばす件数・容量を出す。
- 対応表（元の ID → 新しい ID・S3 のキー）をバンドルの横に書き出す（戻すときと照合に使う）。ディレクトリは 0700・ファイルは 0600 でスクリプトが作る。
- S3 に置いた後で DB に書く前に止まると、どの行からも参照されない原本が残る（`staging/` を通さないのでライフサイクルでも消えず、地図の削除でも消えない）。
  再実行すれば同じキーに上書きして行も入る。やめる場合は、対応表のキーで消す。
- `pin_photo_uploads` の行は作らない（SS-237 で確認）。容量は `pin_photos.uploaded_by_user_id` で数える（`sum_attached_bytes`）。アカウント削除は利用者の prefix
  （`photo_keys.user_photo_prefixes`）ごと消し、地図・ピン・写真の削除は `pin_photos` のキーで消す。`upload_id` で upload の行を引くのはアプリの確定の経路だけで、
  S3 と DB を突き合わせる定期の掃除（ADR-009 BK-3）は実装されていない（実装するときは、upload の行の無い `pin_photos` があることを前提にする）。

### 読み込みの手順

ホストで動かす（バンドルはリポジトリの `tmp/`、AWS の資格情報もホストにある。コンテナには `packages/backend` しかマウントされない）。
backend の依存は、`uv.lock` の版（コンテナ・Lambda で確かめた版）に固定して一時の環境に入れる（プロジェクトの `.venv` はコンテナ用なので作らない。
`--with-editable .` だけだと pyproject の下限を満たす最新の版が入り、サムネイルの作り方や DB の書き方がアプリと違いうる）。packages/backend で:

```bash
uv export --frozen --no-emit-project --quiet -o "$TMPDIR/migration-requirements.txt"   # boto3 も dev の依存として入る
uv run --no-project --python 3.12 --with-requirements "$TMPDIR/migration-requirements.txt" --with-editable . \
  python scripts/walkshare_migration/import_bundle.py \
  --target local --bundle ../../tmp/walkshare-migration/bundle-walkshare --map-id <地図 ID> --user-id <ユーザー ID> --dry-run
```

- local: `.env` を読む。`.env` は compose 用で `DB_HOST` を持たないので、DB は `localhost`（`.env` の `DB_PORT`）に繋ぐ。`STORAGE_MODE=fake` と `DEV_STORAGE_DIR` が要り、
  写真は `packages/backend/storages/dev-storage/` に書く（API のコンテナと同じ場所）。sandbox の中からは localhost に届かないので、エージェントは sandbox の外で動かす。
  移行先の地図は、アプリか `POST /auth/dev-session`・`POST /sanpo-maps` で作る。
- dev・prod: `.env` を読まない。`DATABASE_DSN`・`STORAGE_MODE=real`・`PIN_PHOTO_BUCKET_NAME`・`PIN_PHOTO_BUCKET_REGION` と AWS の資格情報を環境変数で渡し、
  `--aws-account-id` と `--db-host`（その環境の Neon のホスト名）を付ける。
  - DSN は、照合に使うのと同じ `--target` の環境の資格情報で、同じコマンドの中で取り出す（SSM `/sanposcape/<target>/platform/secrets/shared/arn` →
    そのシークレットの `neon_dsn_unpooled`）。別の環境の資格情報ではそのシークレットを読めないので、DSN も照合したアカウントのものになる。
    `get-secret-value` の結果は表示しない（同じ JSON の他の秘密ごと会話の記録に残る）。
  - direct（非 pooled）の DSN を使う（SS-240）。1ピンのトランザクションが写真の処理の間開いたままになるので、PgBouncer（transaction mode）を挟まない
    （Neon も長い処理には direct を勧めている）。
  - `--db-host` は DSN から作らず、Neon のコンソールの Connect（Connection pooling をオフ）で確かめて控えた値を使う（DSN から作ると照合にならない。
    前の作業のコマンドを写すときも打ち直す）。direct なので `-pooler` の付かないホスト名。ホスト名だけを控える（接続文字列にはパスワードが入る）。
  - `--user-id` は、移行先の地図の `sanpo_maps.owner_user_id` を同じ DSN で読み取り専用（`default_transaction_read_only=on`）で読んで渡す（表示しない）。
    地図がその人のものかは、ユーザーが地図 ID を渡すことで決まる（スクリプトの owner の照合は必ず通る）。スクリプトは、ほかのメンバーがいないことを確かめる。
    取り違えの歯止めが地図 ID だけになるので、`--yes` の前に、表示の `quota_used_bytes`（owner が今使っている容量）が本人の想定と合うことをユーザーに確かめてもらう。
  - `~/.aws/config` のプロファイルの `endpoint_url` は使わない（スクリプトが `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true` にする）。
  - dev で流した形（SS-240。`<...>` はユーザーから受け取る。packages/backend で、上の `uv export` の後に、1つのシェルの中で）:

    ```bash
    export AWS_PROFILE=sanposcape-<target>; REGION=ap-southeast-1
    arn=$(aws ssm get-parameter --name /sanposcape/<target>/platform/secrets/shared/arn --region $REGION --query Parameter.Value --output text)
    export DATABASE_DSN=$(aws secretsmanager get-secret-value --secret-id "$arn" --region $REGION --query SecretString --output text \
      | python3 -c 'import sys,json; print(json.load(sys.stdin)["neon_dsn_unpooled"])')
    export PIN_PHOTO_BUCKET_NAME=$(aws ssm get-parameter --name /sanposcape/<target>/platform/pin_photos/bucket_name --region $REGION --query Parameter.Value --output text)
    export PIN_PHOTO_BUCKET_REGION=$REGION STORAGE_MODE=real
    OWNER=$(uv run ... python - <<'EOF'   # 上と同じ環境。地図の owner を読み取り専用で読む（表示しない）
    import os, psycopg
    with psycopg.connect(os.environ["DATABASE_DSN"], options="-c default_transaction_read_only=on") as c:
        print(c.execute("select owner_user_id from sanpo_maps where id = %s", ("<地図 ID>",)).fetchone()[0])
    EOF
    )
    uv run ... python scripts/walkshare_migration/import_bundle.py --target <target> --bundle <バンドル> \
      --map-id <地図 ID> --user-id "$OWNER" --aws-account-id <アカウント ID> --db-host <ホスト名> --dry-run
    ```
- まず `--dry-run`、次に引数そのままで実行して接続先の表示を確かめ、最後に `--yes` を付けて書く。
  その前に、owner を読むのと同じ読み取り専用の接続で、移行先の地図のピンが 0 件であることを件数で確かめる（`--dry-run` の `pins_existing` は uuid5 の ID が
  一致するピンしか数えないので、使っている既存の地図を渡しても気づけない。SS-240 では最初に渡された地図に既存のピンがあり、作り直してもらった）。
- 容量の上限は `PIN_PHOTO_USER_QUOTA_BYTES`（無ければコードの既定値）で数える。その環境の Lambda と同じ値を渡す（SS-236 で上限を変えたら、その値）。
  dev の Lambda はこの環境変数を持たず、既定値（10GiB）で動いていた（2026-10-27。`get-function-configuration` の `keys(Environment.Variables)` で名前だけを見た）。
  その場合は、その環境に SS-236 以降の backend がデプロイ済みであること（`backend deploy (SAM)` の最後の成功した run のコミットが SS-236 のマージ以降か）を
  確かめたうえで渡さない（シェルに残っていれば `unset` する）。デプロイ前の Lambda の上限は 1GiB のままで、スクリプトだけ 10GiB で数えると、入れた後にアプリで写真を足せなくなる。
- 1ピンのトランザクションは、ピンの行を送った後、写真のサムネイル作成と S3 の書き込みの間 idle in transaction になる（最大 45 枚分）。
  流す前に、同じ DSN で `SHOW idle_in_transaction_session_timeout`（ほかに `statement_timeout`・`transaction_timeout`）を確かめる。dev は 5 分で、ほかは 0（無し）だった。
- 書いた後に確かめる（dev で行ったもの。件数だけを出す）。ユーザー ID をコマンドの文字列にも出力にも出さない: 投入と同じシェルの Python で、
  owner を地図から読み（SQL は `created_by_user_id = (select owner_user_id from sanpo_maps where id = %s)` の形）、S3 の prefix も Python の中で組み立てて、
  キーの集合を対応表・`pin_photos` のキーと突き合わせた件数だけを出す（キーの一覧を出すと、どのキーにもユーザー ID が入っている）:
  - DB: 地図のピン・写真・タグの件数と写真の `byte_size` の合計がバンドルと一致すること、ピンの ID の集合が対応表と一致すること、サムネイルの無い写真が 0 件、作成者がすべて指定したユーザーであること
  - S3: 対応表のキー（原本とサムネイル）がすべてあること、そのユーザーの `original/pins/<user_id>/`・`thumb/pins/<user_id>/` に、どの `pin_photos` からも参照されないキーが無いこと
  - `--dry-run` をもう一度流し、入る件数が 0 になること
  - アプリで地図を開いて見え方を確かめる（ユーザー。下の「アプリでの見え方」）
- 戻すときにアプリで地図ごと消すと、写真のキーが約 4,000 あるので、S3 の削除が締め切りで打ち切られ、残りはどの行からも参照されないまま残りうる（ADR-009 決定28）。
  その場合は対応表のキーで消す。
- 対応表は `<バンドル>.import-<target>-<地図 ID>.json`（バンドルの横）。

## walkshare の書き出し（SS-238）

入力は Firestore のダンプ（地図・スポット・写真・名前）と GCS の原本。

### 移す範囲（2026-10-25 ユーザー決定）

- 本人のアカウントが作ったスポットと、作成者の記録が無いスポット（walkshare が作成者を記録し始める前のもの）を移す。もう1つのアカウントが作ったスポットは移さない。
  本人のアカウントの uid は `tmp/walkshare-migration/config.json` に書く（ここには書かない。下の「手順」）。
- 移すスポットに付いた写真は、アップロードしたアカウントに関わらずすべて移す。どのスポットからも参照されない写真は移さない。
- 件数: ピン 647（写真なし 89）・写真 1,979・タグの付くピン 48（1ピン最大 4）。

### マッピング

| sanposcape | walkshare | 備考 |
| --- | --- | --- |
| `name` | `spot.title` | 前後の空白を除く（4件が該当）。空なら null。最大 33 文字 |
| `memo` | `spot.comment` | 前後の空白を除く（1件が該当。API の `PinCreate` と同じ）。空なら null（539件が該当） |
| `latitude`・`longitude` | `spot.point` | |
| `created_at` | `spot.date` | 全件ある |
| `updated_at` | max(`created_at`, `spot.last_visited`) | `last_visited < date` が 6件あるため max を取る。写真の `created_at` は入れない（ADR-009 決定23: 写真の追加では `updated_at` を変えない） |
| `visited` | 常に true | walkshare のスポットは訪れた場所の記録で、`last_visited` が全件ある |
| `archived` | 常に false | |
| `tags` | 写真の `name` → `names.name` | ピンの写真の順に集め、`tag_labels` で正規化・重複除去。最大 5 文字・1ピン最大 4 件。`created_at` はすべてピンの `created_at`（並びは読み込みの繰り上げで配列の順になる） |
| 写真の並び | `spot.photos` の順 | `position` は 0 からの連番 |
| 写真の `taken_at` | `photo.date` | null が 57 枚 |
| 写真の `created_at` | max(ピンの `created_at`, `taken_at`) | `taken_at` が null ならピンの `created_at`。1,979 枚のうち 1,326 枚はスポットの作成より後に撮られている（再訪で足した写真） |

捨てるもの: `spot.score`、`names` の読み・場所・メモ・顔写真、`maps/<地図名>/faces/`・`_cache/` の画像、作成者・アップロード者の uid。

### 写真の処理

- GCS から1枚ずつメモリに取り、EXIF の向きを画素に反映 → 長辺 2048px に縮小（LANCZOS）→ JPEG 品質 70 で保存（Exif などのメタデータは付けない）。mobile の再圧縮（長辺 2048px・品質 0.7）に合わせる。
- ICC プロファイルは色の情報なので引き継ぐ（原本の `image.info["icc_profile"]` を `save(icc_profile=...)` に渡す。`jpeg_metadata.py` も ICC は残す）。
  原本が RGB 以外（CMYK・グレー）なら、`convert("RGB")` の後の色空間と合わないので付けない。原本の ICC は、1,979 枚のうち Display P3 が 1,889 枚・カメラの sRGB が 7 枚・無しが 83 枚（SS-238 の実データ）。
  ほとんどが sRGB 以外なので、ICC を落とすと色がずれる。
  見積もり（下）は ICC を落として測ったが、ICC は数 KiB なので結果は変わらない。
- 原本は手元に残さない。処理済みの JPEG だけをバンドルに書く。バンドルにあり sha256 が合う写真は飛ばす（途中から再開できる）。

### 容量の見積もり（2026-10-26）

移す範囲から無作為に 40 枚を選び、上の処理で再圧縮した。

| | 原本 | 再圧縮後 |
| --- | --- | --- |
| 長辺 | 全件 4032px | 2048px |
| 1枚の大きさ | 中央値 2,460KiB・平均 2,715KiB | 中央値 447KiB・平均 484KiB（210〜967KiB） |

- 実際の書き出し（SS-238、2026-10-26）は 1,979 枚で 1,046,174,358 バイト（0.97GiB）、1枚の最大 1.16MiB。長辺 2048px 未満の原本が 8 枚あった（拡大しない）。
- 見積もりは 1,979 枚で **0.9〜1.0GiB**。再圧縮後の平均 × 枚数で約 935MiB（0.91GiB）、標本の大きさの比（約 18%）× 原本の合計（参照される写真の分で 5.70GiB）で約 1.0GiB。
  標本の原本は全体（1枚の平均 約 3,000KiB）より小さめに偏っているので、上の側に寄りうる。
- 標本の1枚の最大は 1MiB に届かず、実際の書き出しの最大も 1.16MiB で、`pin_photo_max_bytes`（10MiB）に十分収まる。
- 容量の上限に数えるのは原本の `byte_size` だけで、サムネイルは数えない。1GiB の上限のままだと、walkshare の分だけで上限に届きうる。上限を 10GiB に上げる SS-236 を dev への投入（SS-240）の前に出す（SS-236 で既定値を 10GiB にした。各環境の上限はその backend のデプロイで上がる）。

### walkshare の書き出しの手順

スクリプトは `dump_walkshare.py`（Firestore → ダンプ）・`export_walkshare.py`（ダンプ + GCS → バンドル）・`bundle.py`（バンドルの形。読み込みと共有）。
ADC と Google への通信はホストにしか無いので、ホストで `uv run --no-project` で動かす（backend の依存に Google のライブラリを入れない。
コンテナには `packages/backend` しかマウントされず、リポジトリの `tmp/` も無い）。

1. ADC でログインしておく（`gcloud auth application-default login`。ユーザーが実行する）。
2. `tmp/walkshare-migration/config.json`（0600）を作る。本人の uid はここにだけ書く。

   ```json
   {"firebase_project": "<Firebase のプロジェクト ID>", "map_id": "<地図のドキュメント ID>", "bucket": "<写真のバケット>", "owner_uid": "<本人の uid>"}
   ```

3. packages/backend で実行する（どちらも読み取りだけ。出力は件数・容量だけ）。

   ```bash
   GOOGLE_CLOUD_QUOTA_PROJECT=<プロジェクト ID> uv run --no-project --python 3.12 \
     --with 'google-cloud-firestore>=2.19,<3' python scripts/walkshare_migration/dump_walkshare.py
   GOOGLE_CLOUD_QUOTA_PROJECT=<プロジェクト ID> PYTHONPATH=src uv run --no-project --python 3.12 \
     --with 'google-cloud-storage>=2.18,<4' --with 'pillow>=12.3.0' python scripts/walkshare_migration/export_walkshare.py
   ```

- 出力: ダンプは `tmp/walkshare-migration/dump/`、バンドルは `tmp/walkshare-migration/bundle-walkshare/`。
  `tmp/` は worktree ごとにあり、worktree を消すと一緒に消える（SS-235 のダンプはこれで消えた）。別の worktree で読み込むなら、手順をそこで流し直すかコピーする。
- バンドルには書き出しだけが使う `.progress.jsonl`（書いた写真の sha256・大きさ）が残る。読み込みは見ない。
  中断しても同じコマンドで続きから流せる。ダンプを取り直した後も、sha256 が記録と合う写真は GCS から取らない。
- ダンプ・書き出しは想定外のデータ（参照先の無い写真・長すぎる名前・2つのピンにある写真など）では切り詰めずに止まり、ピンと写真の連番だけを出す。
- テストは `pytest`（コンテナ。`testpaths` に入っている）。

## sanposcape の地図の書き出し（SS-239）

- 入力は環境（dev）と地図の ID。DB と S3 は読み取りだけ。
- 写すもの: ピン（`name`・`memo`・位置・`visited`・`archived`・`created_at`・`updated_at`）、タグ（ラベル・`created_at`）、写真（`position`・`taken_at`・`created_at`。原本は S3 の `original/` をそのまま。再圧縮しない）。
- 写さないもの: 作成者・アップロード者、散歩との紐付け、サムネイル（読み込みで作り直す）。
- 地図に複数のユーザーのピンがあっても、すべて書き出し、読み込みで指定したユーザーのものにする。書き出しは作成者ごとの件数を出し、2人以上なら警告する（`--created-by` で絞れるようにする）。
- 往復の確かめ: local で書き出し → 別の地図に読み込み、元の地図と同じに見えることを確かめる。

## アプリでの見え方を確かめるとき（SS-240・241）

- 地図の画面は表示範囲のピンを1回 200 件まで取る（`GET /pins?limit=200`、`created_at` の新しい順。ADR-009 SS-118 追補）。
  walkshare の 647 件を1つの地図に入れると、縮小した状態では新しい 200 件と「一部だけ表示」の案内だけが出る。仕様どおりで、移行の欠けではない。
  件数は拡大して確かめるか、DB の件数で照合する。

## 個人のデータの扱い

- ダンプ・バンドル・対応表はリポジトリの `tmp/walkshare-migration/` の中にだけ置く（git の外。ディレクトリ 0700・ファイル 0600）。SS-242 で消す。
- local の予行（SS-240）で、本物のデータが local の DB（docker の volume）と fake storage（`packages/backend/storages/dev-storage`）にも入る。
  これも SS-242 で消す（移行先にした local の地図を消し、fake storage に残ったキーがないことを確かめる）。
- 対応表の S3 のキーと S3 の `original/pins/<user_id>/`・`thumb/pins/<user_id>/` を突き合わせ、途中で止まった分の原本が残っていないことを確かめる
  （prod は SS-241 の完了の前に、dev は SS-242 で）。
- 移したデータは通常のピン・写真と同じテーブル・同じ S3 のキーに入り、地図の削除・アカウントの削除で同じように消える。
  アプリが扱うデータの種類・保存先・保存期間は変わらないので、データ取扱い台帳（`docs/privacy/data-inventory.md`）は変えない。
- dev に入れた walkshare の地図は、prod での確認（SS-241）の後に SS-242 で消す（本物の写真の複製を減らすため）。
- スクリプトとこの README を消した後も prod のデータに残る事実（作成日時がアプリの公開より前のピンがあること、ID が uuid5 であること、`client_walk_id` が null であること、`pin_photo_uploads` の行の無い `pin_photos` があること）は SS-242 で既存の ADR に追補する。
