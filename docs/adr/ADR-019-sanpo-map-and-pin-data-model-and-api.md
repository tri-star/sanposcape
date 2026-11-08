# ADR-019: 地図（SanpoMap）とピン（Pin）のデータモデルと API

## 日付

2026-11-08（[ADR-009](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) から分割。決定の初出は 2026-09-21〜2026-11-07）

## ステータス

採用（backend・mobile 実装済み。prod で稼働中）

## コンテキスト

散歩中に見つけた場所を、名前・メモ・タグ・写真つきで地図に登録する機能（ピン登録）の決定は、
ADR-009 に 2026-09-21 から 19 回の追補で積み上げてきた。2,200 行を超えて現在の決定が読み取れなくなったため、
領域ごとに4つの ADR に分け、ADR-009 は経緯の記録として凍結した（`docs/adr/archived/`）。

| ADR | 対象 |
| --- | --- |
| **ADR-019（本 ADR）** | 地図とピンのデータモデル、地図・ピン・タグの API |
| [ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) | 地図の共有: 権限・メンバー・招待・ピンの移動の条件・表示の切り替え |
| [ADR-021](./ADR-021-pin-photo-upload-storage-and-delivery.md) | 写真のアップロード・保存・配信・容量 |
| [ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md) | ピン・写真・地図・アカウントの削除と S3 の後始末 |

本 ADR の各決定の見出しにある「旧 決定N」は ADR-009 の決定番号。コードのコメントなどにある
「ADR-009 決定N」は、凍結した ADR-009 の冒頭の対応表から本 ADR 群の決定を引ける。
モジュール構成・依存の規則は [ADR-011](./ADR-011-sanpo-maps-module-structure.md) が正本。

前提となる決定:

- [ADR-002](./ADR-002-auth-google-signin-and-stub-strategy.md) 決定4: 認証の choke point は `get_current_user`。モードの切り替えは許可リスト方式の fail-safe。
- [ADR-003](./ADR-003-walk-record-persistence-and-history-api.md) 決定3・6・7: `client_*_id` による冪等な作成（新規 201・再送 200）、他人のリソースは 404、`User` に `relationship()` を張らず `ON DELETE CASCADE` に任せる。
- [ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) 決定9: マイグレーションは手動・デプロイの後に実行する。
- [ADR-008](./ADR-008-deploy-release-separation.md): フィーチャーフラグ（AWS AppConfig）と expand / contract。

## 決定

### 決定1: 用語 — ピン（Pin）/ 地図（SanpoMap）/ スポット（`SpotCandidate` に限定）（旧 決定1）

| 概念 | コード / DB | API |
|---|---|---|
| 地図（ピンの入れ物） | `SanpoMap` / `sanpo_maps` / `sanpo_map_members` | `/sanpo-maps`、`sanpo_map_id` |
| 登録地点 | `Pin` / `pins` | `/pins`、`client_pin_id` |
| ピンの写真 | `PinPhoto` / `pin_photos` | `photos` |
| 写真のアップロード枠 | `PinPhotoUpload` / `pin_photo_uploads` | `/pin-photo-uploads`、`upload_id` |
| ピンのタグ | `PinTag` / `pin_tags` | `tags` |
| 招待 | `SanpoMapInvitation` | `/sanpo-maps/{id}/invitations`、`/invitations/*` |

`Map` 単体・`Spot` 単体という語は使わない。前者は `maps/` ドメイン（探索・経路の算出）と、後者は
`SpotCandidate`（散歩の目的地の候補）と衝突するため。旧サンプル API `GET/POST /spots` は削除済み。

### 決定2: 地図とピンは N:1。権限は `sanpo_map_members` の role で判定する（旧 決定2）

- **ピンはちょうど1つの地図に属する**（多対多にしない）。同じ場所を2つの地図に入れたいなら別のピンにする。
  多対多だと「どの地図の owner が削除できるか」「容量をどこに計上するか」の判定が地図の組み合わせで変わる。
- 権限は常に `sanpo_map_members`（`sanpo_map_id`, `user_id`, `role`, `pins_visible`, `created_at`）の行で判定する。
  **owner も member の行を持つ**（`role="owner"`）。招待された人は `role="editor"`。
- 作成者の列（`pins.created_by_user_id`・`pin_tags.created_by_user_id`・`pin_photos.uploaded_by_user_id`）を持ち、
  権限の判定と容量の計上に使う。権限の表は [ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定2。

### 決定3: 既定地図と「最初の地図」（旧 決定3・決定27）

- **不変条件: owner が自分の地図を1つ以上持つなら、既定地図（`is_default`）がちょうど1つある。**
  「owner ごとに1つ」は部分一意インデックス `uq_sanpo_maps_owner_user_id_is_default`（`WHERE is_default`）で担保する。
- **`POST /pins` の `sanpo_map_id` は省略可・null 不可**（`SkipJsonSchema[None]`。明示的な null は 422）。省略すると自分の既定地図に入れ、
  無ければ**同じトランザクションで**「最初の地図」を作って既定にする（`resolve_map_for_new_pin`）。同時作成の一意違反は savepoint で捕まえ、既存の既定地図を返す。
- **`POST /sanpo-maps` は、自分の既定地図が無ければ作った地図を既定にする**（`is_default` はリクエストで受け取らない）。
  mobile は「自分の既定地図が無い ⇔ draft の『最初の地図』を出す」規則で動くので、既定にしないと保存時にもう1つ地図ができる。
- **既定地図も削除できる。** 消したら同じトランザクションで、残りの自分の地図のうち `updated_at DESC, id DESC` の先頭を既定に繰り上げる
  （`promote_latest_to_default()`。候補が消えていたら選び直す。上限 `_PROMOTE_MAX_ATTEMPTS` 回）。残りが無ければ既定なしになり、次の `POST /pins` が「最初の地図」を作る。
- **`create_map` と `delete_map` は owner 単位の advisory lock（`SanpoMapRepository.lock_owner()`）で直列化する。**
  `resolve_map_for_new_pin` はこのロックを取らない。この経路は既定を足すだけで消さないので、一意インデックスと savepoint で足りる。
- `GET /sanpo-maps` の `is_default` は「リクエストした人にとっての既定地図か」（`is_default AND owner_user_id = 自分`）。他人の既定地図に招待された editor には false。
- 却下: 既定地図の削除を 409 で禁止する（地図が1つの人が消せない）／削除しても繰り上げない（消した名前の地図が再び作られたように見える）。

### 決定4: 地図の API（旧 決定25・決定29）

- **`GET /sanpo-maps`**: 自分が member の地図。並びは「自分の既定地図 → `updated_at DESC, id DESC`」。
  `?expand=pin_count`（`expand: list[Literal["pin_count"]]`。未知の値は 422）で地図ごとのピンの件数（`int | null`）を1クエリで返す。
  未指定・`POST`/`PATCH` の応答では null。件数はアーカイブ済みのピンも数える。集計は `SanpoMapRepository.count_pins_for_maps()`。
- **`POST /sanpo-maps`**: `{"name": str, "icon"?: SanpoMapIcon}`。201 + `SanpoMapRead`（`role="owner"`）。冪等キーは持たない。地図の数に上限は無い。
- **`PATCH /sanpo-maps/{id}`**: `SanpoMapUpdate`（`extra="forbid"`。`name`・`icon` は省略可・null 不可）。`{}` は 200 で何も変えない。200 + 更新後の `SanpoMapRead`。
- **`DELETE /sanpo-maps/{id}`**: 204。非冪等（2回目は 404）。503 は宣言しない。手順は [ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md) 決定3。
- **名前**: `str.strip()`（全角空白・NBSP を含む Unicode の空白）の後に 1〜50 文字。空白だけは 422。重複は許す。
- **`sanpo_maps.updated_at` は「最近ピンを追加した地図」を先頭にする並び専用の列**。名前・アイコンの変更、表示の切り替えでは動かさない。
  動かすのはピンの追加・写真の追加・ピンの移動先（`mark_used()`）。
- `SanpoMapRead` は `role`・`is_default`・`icon`・`pins_visible`（本人の値。[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定7）・`pin_count` を持つ。
- 地図そのものを変えられるのは owner だけ（[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定2）。

### 決定5: 地図はアイコン `icon` を持つ（旧 決定31）

- **アイコンは地図の属性で、ピンの見た目は属する地図のアイコンで決まる**（ピンごとのアイコンは持たない）。必須・null なし・既定 `pin`。
- **値は `SanpoMapIcon` の13値**（`pin` / `tree` / `flower` / `leaf` / `sun` / `rain` / `retreat` / `landmark` / `coffee` / `food` / `bakery` / `shopping` / `cat`）。
  ドメインの語で、Lucide のアイコン名ではない（Lucide のリネームに API を縛られない）。グリフ・色の対応は mobile が持つ（[ADR-M-019](../../packages/mobile/adr/ADR-M-019-sanpo-map-icon-and-map-pin-shape.md)）。
- **DB は `sanpo_maps.icon VARCHAR(16) NOT NULL DEFAULT 'pin'` + `ck_sanpo_maps_icon`**。PostgreSQL のネイティブ enum は使わない
  （前例が無い・テスト DB の初期化が前提にしていない・値の追加が制約の作り直しで済む）。値の定義は `sanpo_maps/models.py` の `SanpoMapIcon`（CHECK と API スキーマで共有）。
- **値の追加**: (1) `SanpoMapIcon` に足す (2) 新しいリビジョンで CHECK を作り直す（値はマイグレーションに直書きする） (3) `openapi.yaml` を更新する (4) mobile の対応表に足す。
  古い mobile は未知の値を `pin` で描くので backend を先に出してよい。**値の削除は contract**（既存の行を寄せるデータ移行と、古い mobile がいなくなることの確認が要る）。
- ピンの API には地図のアイコンを載せない（mobile は `GET /sanpo-maps` の一覧から `sanpo_map_id` で引ける）。

### 決定6: ピンの作成（旧 決定3・決定5・決定32）

- **`POST /pins`**: `client_pin_id` で冪等（新規 201・再送 200。再送では既存のピンをそのまま返す）。`sanpo_map_id` の省略は決定3。
  `visited` は省略可で既定 false。`archived` は受け付けない（`PinCreate` は `extra="forbid"` ではないので、未知のキーと同じく無視する）。
  `photo_upload_ids`（最大10件）を含めると写真の確定まで同じリクエストで行う（[ADR-021](./ADR-021-pin-photo-upload-storage-and-delivery.md) 決定1）。
- 地図に入れられるのは owner・editor（[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定2）。ピンの追加では地図の `mark_used()` を呼ぶ。
- タグは1ピン最大10件（`PIN_TAGS_MAX_COUNT`）。正規化（trim・連続空白の圧縮・先頭記号の除去・小文字での重複判定）は mobile と backend の二重実装で、
  同じケース表を両方のテストに置いてずれを検知する。正規化の関数は `sanpo_maps/pins/tag_labels.py` の `tag_key()`。

### 決定7: ピンの閲覧 API（旧 決定14〜17・SS-111 追補・決定32）

- **`GET /pins`**: `sanpo_map_id` は**必須**（任意を必須にするのは破壊的だが、逆は expand で緩められる）。
  並びは `created_at DESC, id DESC` の keyset ページング、limit は既定50・最大200。総件数（`total_count`）は返さない。
  - **bbox は4つのクエリ**（`min_latitude`/`min_longitude`/`max_latitude`/`max_longitude`）。4つそろえるか1つも指定しない。そろっていない・`min > max` は 422。
    境界上の点は含める。日付変更線をまたぐ範囲は扱わない。**bbox を指定しても並びは作成日時の新しい順のまま**。
  - `q`: 名前・メモ・タグの部分一致（ILIKE）。`tags`: 複数指定は AND、`tag_key()` で正規化した後の完全一致。
  - `archived`・`visited`（`bool | None`）: **省略すると絞り込まない**。指定すると等号で、bbox・`q`・`tags`・cursor と AND で **`limit` の前に**絞る。
  - 要素 `PinListItemRead` は `cover_photo: PinPhotoRead | null`（position が最小の写真）と `tags` を持ち、`memo` は持たない（1ページ最大200件で応答が大きくなるため）。
- **`GET /pins/{pin_id}`**: `PinRead`。写真は position 順の先頭10件（`PIN_READ_PHOTOS_LIMIT`）と総数 `photo_count`。
- **`GET /pins/{pin_id}/photos`**: 写真の全件を `PinPhotoPageRead {items, photo_count, next_cursor}` で返す。`(position, id)` の keyset、limit は既定30・最大100。
- 写真の URL・ストレージの障害時の扱いは [ADR-021](./ADR-021-pin-photo-upload-storage-and-delivery.md) 決定9。閲覧 API はストレージを理由に 503 にしない。
- mobile の地図表示は、地図ごとに `GET /pins` を並列に呼び、`next_cursor` を辿って地図ごと 1,000 件まで取って端末でクラスタにまとめる
  （[ADR-M-012](../../packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md) D3・D4 の SS-243 追補）。地図の数が増えて往復が問題になったら `sanpo_map_id` の任意化（expand）を検討する。

### 決定8: ピンの更新（`PATCH /pins/{id}`）と `updated_at`（旧 決定20・決定23）

- **`name`・`memo`・タグ・`visited`・`archived`・`sanpo_map_id` を1つの `PATCH` で原子的に更新する。** タグ専用のエンドポイントは作らない（保存1回を1リクエストにする）。
  `location`・`client_walk_id` は変えられない。`PinUpdate` は `extra="forbid"`。各フィールドは省略可で、`name`/`memo` 以外は null 不可。
- **タグは差分で送る**（`add_tags`: ラベルの配列、`remove_tag_ids`: `PinTagRead.id` の配列）。全置換は採らない
  （共同編集での lost update を避ける・削除の権限がタグごとに違う・再送しても結果が変わらない）。
  - 適用の順は「削除 → 追加 → 件数」。適用後に10件を超えたら commit せず 409（決定13）。権限の確認も `remove_tag_ids` → `add_tags` の順。
  - このピンに属さない `remove_tag_ids` は黙って無視する（同時削除・再送で他の変更まで失敗させない）。
  - 同じラベルを削除と追加の両方に含めると、削除してから追加し直す（作成者が付け替わる）。
- **権限は「送られたフィールド」で判定する**（`model_fields_set`。値が今と同じでも送れば判定する）。**1つでも権限が無ければ全体を 403 にして何も反映しない。**
- `{}` は 200 で何も変えない（`updated_at` も動かさない）。応答は `PinRead`（`GET /pins/{id}` と同じ形）。
- **`Pin.updated_at` は、ピン本体（名前・メモ・タグ・訪問・アーカイブ・所属する地図）が実際に変わったときだけ**、注入した `now()` で進める（`onupdate` は使わない）。
  写真の追加・削除では動かさない。PATCH は地図の `mark_used()` を呼ばない（例外はピンの移動。決定10）。
- 判定の順: 401 → 422 → ピンの member（404）→ 移動先の member（404）→ role の権限（403）→ 移動の条件（403）→ タグの件数（409）。

### 決定9: ピンは訪問状況 `visited` とアーカイブ状態 `archived` を持つ（旧 決定32）

- **DB は `pins.visited`・`pins.archived`（ともに `BOOLEAN NOT NULL DEFAULT false`）**。日時（`visited_at` など）は持たない（「実際に訪れた日」と誤読されやすく、使う要件が無い）。
- **訪問状況はピン単位でメンバー間で共有する**（メンバーごとには持たない）。
- 変えられる人: `visited` はメンバー全員、`archived` は地図の owner かピンの作成者（[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定2）。
- **アーカイブは地図表示から隠すだけ**で、ロックしない（編集・写真やタグの追加はできる）。`pin_count`・地図のタグ一覧はアーカイブ済みも数える。
  地図表示から除くのは mobile が `archived=false` を付けて、backend の WHERE で絞る。検索（`q`/`tags`）の結果にも、指定しなければアーカイブ済みが含まれる。
- インデックスは足していない。遅くなったら `WHERE NOT archived` の部分インデックスなどを検討する。

### 決定10: ピンを別の地図へ移す（旧 決定33）

- **`PATCH /pins/{id}` の `sanpo_map_id` で移す**（専用のエンドポイントは作らない）。応答の `sanpo_map` は移動先。
- **`pins.sanpo_map_id` だけを UPDATE する。** タグ・写真・作成者・アップロード者・容量の計上先・`visited`・`archived` は変えない。
  **S3 は触らない**（写真のキーは地図に依存しない）。`pin_count`・タグ一覧は変更なしで移動先の集計に入る。
- 権限は移動元（ピンの今の地図）の `can_move_pin_from` と、移動先の `can_move_pin_to`。ほかのフィールドの権限は移動元の role で判定する。
  **移動先に移動元の全メンバーがいなければ 403**（[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定6）。候補は `GET /pins/{pin_id}/move-targets`（同 決定6）。
- 地図が実際に変わったときだけ `Pin.updated_at` を進め、**移動先の `mark_used()` を呼ぶ**（移動先へのピンの追加とみなす）。
  commit の後に `Pin moved: pin_id=… from_sanpo_map_id=… to_sanpo_map_id=… by user_id=…`（ID だけ）を INFO で出す。
- **並行実行**:
  - 移動はピン行（`FOR UPDATE`）→ 移動先の地図の行（`FOR KEY SHARE`。`get_membership_for_key_share()`）の順に取る。移動先が同時に削除されたら、待った後に 404 `sanpo_map_not_found`。
  - **今の地図と同じ ID を送ったときは地図の行をロックしない**（取得済みの role を移動先の role に使う）。ロックすると地図の削除と循環してデッドロックする。
  - 地図の削除は写真のキーを集める前に地図のピン行をロックする（[ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md) 決定3）。移動中のピンの写真を S3 から消さないため。
  - テストで固定したのは (a) 移動中のピンがある地図を消しても移動先で生き残る写真が S3 に残る (b) 移動先が同時に消されたら 404 でピンは元の地図に残る
    (c) 同じ地図の ID を送る PATCH と地図の削除がデッドロックしない（`maps/tests/test_delete_map_concurrency.py`）。それ以外の組み合わせは分析上の結論で、網羅の証明ではない。
  - 移動の commit を待っていた同じピンへの別の操作は、移動先のメンバーでも 404 `pin_not_found` になる（2台の端末で同じピンを同時に操作したときだけ。取り直せば見える）。
- リリース順: backend を先に出す（古い backend に `sanpo_map_id` を送ると `extra="forbid"` で 422）。

### 決定11: 地図のタグ一覧 `GET /sanpo-maps/{id}/tags`（旧 決定30）

- **応答は `SanpoMapTagListRead { items: SanpoMapTagRead[] }`**。`SanpoMapTagRead` は `label` と `pin_count` だけ（どちらも required）。`next_cursor` は持たない（上位 N 件のランキング）。
- 集計は地図の**全ピン**のタグを `label_key` 単位で。`label` は同じ `label_key` のうち `created_at DESC, id DESC` の先頭（最後に付けられた表記）。`pin_count` は `count(*)`（`UNIQUE(pin_id, label_key)` が前提）。
- 並びは `pin_count DESC` → 最後に使われた日時 DESC → `label_key ASC`（`COLLATE "C"` のバイト順）。`limit` は既定100・1〜200。`q` は持たない。
- member なら可。非メンバーは 404。Repository のクエリ自体も `sanpo_map_members` を `user_id` で JOIN して絞る（多重防御）。
- 置き場所は `sanpo_maps/maps/`（`SanpoMapRepository.list_tag_summaries()`）。mobile の使い方は [ADR-M-013](../../packages/mobile/adr/ADR-M-013-pin-tag-suggestions.md)。

### 決定12: 応答に閲覧者の role・操作可否を含めない（旧 決定24）

`PinRead` などに `role`・`can_edit` を足さない。mobile は `GET /sanpo-maps` の `role` と、`PinRead` の作成者 ID・セッションの user id から
操作の出し分けを判定し、role が引けないときは editor（メンバーの最小権限）とみなす（[ADR-M-017](../../packages/mobile/adr/ADR-M-017-pin-edit-and-delete.md) D5）。
安全性は backend の 403 で担保する。必要になれば expand で足せる。

### 決定13: エラー応答の `code`（旧 決定12・決定20・決定33・決定42）

`detail` の固定文言は変えず、機械で区別する必要があるものだけ `code` を足す。付与は `main.py` の例外ハンドラ（`register_exception_handlers()`）に閉じるので、
同じ例外を投げる全エンドポイントの本文に付く。

| HTTP | `code` | 主な発生元 | OpenAPI のスキーマ |
| --- | --- | --- | --- |
| 404 | `pin_not_found` / `sanpo_map_not_found` | ピン・地図が無い／member でない | `PinUpdateNotFoundErrorRead`（宣言は `PATCH /pins/{id}` だけ） |
| 403 | `move_target_missing_members` | ピンの移動の条件（ADR-020 決定6） | `PinUpdateForbiddenErrorRead`（`code` は任意） |
| 409 | `storage_quota_exceeded` / `photo_upload_not_ready` | 写真の確定・枠の発行（ADR-021 決定8） | `PinConflictErrorRead` |
| 409 | `tag_limit_exceeded` | タグが10件を超える（決定8） | `PinTagConflictErrorRead` |

既存の enum（`PinConflictErrorRead.code` など）は広げず、新しい種類にはスキーマを分ける（他のエンドポイントの契約と mobile の網羅的な分岐を変えないため）。
メンバー・招待の `code` は [ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md)。

### 決定14: フラグ `pin_registration` は API をガードしない（旧 決定10）

`pin_registration`（`audience="client"`）は mobile がピン登録の UI を出し分けるためだけに使う。backend の API はガードしない
（認証必須で本人のデータしか作れない・フラグを消すときの分岐が増える・ストレージ未構成は 503 で安全側に倒れる）。
production では 2026-10-17 に ON にした。これ以降に足した地図・ピンの API も、原則としてフラグでガードしない
（例外は招待。[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定5）。

### 決定15: 既存テーブルへの列追加はマイグレーションだけの PR を先に出す（旧 決定31・決定32・決定34・決定41 の「デプロイ」項）

マイグレーションの Lambda は API と同じ成果物を使うので、マイグレーションをコードより先に流せない（ADR-005 決定9）。
列を読むコードを先にデプロイすると、migrate までの間その表を読む API が `UndefinedColumn` で 500 になる。
**prod の稼働（2026-10-01）後は、マイグレーションだけの PR を先にマージ・デプロイ・migrate してから、列を読むコードの PR を出す**
（初例は `sanpo_map_members.pins_visible` の PR #241 → #242。[リリース運用手順](../release-runbook.md) §2・§7.4）。
列は既定値つきの NOT NULL（PG11+ では表を書き換えない）にして、古いコードの INSERT を通す。

## 検討した選択肢

- **地図とピンを多対多にする**: 「同じ場所を複数の地図に入れる」使い方はできるが、削除の権限と容量の計上先が地図の組み合わせで変わり、IDOR の対策も複雑になる。N:1 で要件を満たせるので採らない。
- **PATCH を全置換にする / タグ・アーカイブ・移動を専用のエンドポイントにする**: 全置換は共同編集で他人のタグを消し、権限の判定が推測になる。専用のエンドポイントは、フィールド単位の権限判定で表現でき保存1回で送れるので要らない。
- **`GET /pins` で既定でアーカイブ済みを除く**: リリース済みのアプリの一覧が変わる。
- **地図のアイコンを自由な文字列・Lucide の名前・ピンごと・null 許容にする**: 対応表との食い違い、Lucide への依存、「ピンの見た目は地図で決まる」というドメインの決定との矛盾、mobile のフォールバックの複雑化のため採らない。

## 影響

### ポジティブな影響

- owner も member の行を持つので、招待は `role="editor"` の行を足すだけで済んだ（権限の判定の経路を増やさない）。
- 応答の項目の追加・`code` の追加は後方互換で、配布済みのアプリを壊さずに機能を足せる。

### ネガティブな影響・トレードオフ

- タグの正規化が mobile と backend の二重実装になる。
- `POST /pins` で指定した地図が同時に削除されると、`resolve_map_for_new_pin` がロックを取らないので FK 違反で 500 になりうる（直すなら `get_membership_for_key_share()` を流用する）。

### 将来の課題

- 1つの地図のピンが数千件を超えると、bbox の絞り込みが `ix_pins_sanpo_map_id_created_at_id` 上の行の読み飛ばしになり遅くなりうる。`(sanpo_map_id, latitude, longitude)` の B-tree か PostGIS を検討する。
- `q` の `ILIKE '%…%'` はインデックスが効かない。必要なら `pg_trgm`。
- 地図のタグ一覧で文字列の絞り込みを足すなら、`tag_key()` を共有カーネルへ移す（ADR-011 M2 の追補）か、`pins` 側に置くかを決める。ピンが数千件を超えたら `pin_tags(pin_id, label_key, created_at)` のカバリングインデックスか集計テーブルを検討する。

## 関連情報

- 経緯の記録: [ADR-009（凍結）](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
- [ADR-011: sanpo_maps のモジュール構成](./ADR-011-sanpo-maps-module-structure.md)
- mobile: [ADR-M-012](../../packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md)（地図表示・詳細）、[ADR-M-013](../../packages/mobile/adr/ADR-M-013-pin-tag-suggestions.md)（タグの候補）、[ADR-M-014](../../packages/mobile/adr/ADR-M-014-sanpo-map-list-and-detail.md)（地図の一覧・詳細）、[ADR-M-017](../../packages/mobile/adr/ADR-M-017-pin-edit-and-delete.md)（ピンの編集・削除・移動）、[ADR-M-019](../../packages/mobile/adr/ADR-M-019-sanpo-map-icon-and-map-pin-shape.md)（地図のアイコン）、[ADR-M-021](../../packages/mobile/adr/ADR-M-021-pin-visit-status-and-archive.md)（訪問・アーカイブ・表示の切り替え）
- Plane: SS-88、SS-111、SS-112、SS-113、SS-136、SS-171、SS-173、SS-175
