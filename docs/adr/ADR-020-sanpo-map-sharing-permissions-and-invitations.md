# ADR-020: 地図の共有 — 権限・メンバー・招待

## 日付

2026-11-08（[ADR-009](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) から分割。決定の初出は 2026-09-21〜2026-11-07）

## ステータス

採用（backend・mobile 実装済み。招待の発行・受諾はフラグ `map_invitation` の後ろにあり、production では OFF）

## コンテキスト

地図は owner 1人で始まり、招待で editor が加わる（Plane SS-90 = 旧 BK-7）。誰が何をできるか、他人から何が見えるか、
メンバーが変わったときにデータをどう扱うかを本 ADR にまとめる。データモデルと API の契約は
[ADR-019](./ADR-019-sanpo-map-and-pin-data-model-and-api.md)、削除のときのデータの扱いは [ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md)。
見出しの「旧 決定N」は凍結した ADR-009 の決定番号。

招待はプライバシーポリシーの、利用者に不利な改定を伴うので、施行日（2026-12-02）付きで先に改定した（[ADR-012](./ADR-012-lp-static-site-astro-s3-cloudfront.md) の SS-248 追補）。

## 決定

### 決定1: 権限は role と作成者の列で判定し、関数は3つの形に収める（旧 決定19・決定26）

- 行為者は「リクエストした人とピン（または地図）の関係」で分類する。ピンが属する地図の `sanpo_map_members` の行（role）と、対象ごとの作成者の列で判定する。
- **「対象の作成者」は操作ごとに違う**: ピンは `pins.created_by_user_id`、タグは `pin_tags.created_by_user_id`（ピンの作成者ではない）、写真は `pin_photos.uploaded_by_user_id`。
  写真の持ち主をアップロード者とするのは、容量をアップロード者に計上する（[ADR-021](./ADR-021-pin-photo-upload-storage-and-delivery.md) 決定6）のと揃えるため。
- 実装は `sanpo_maps/permissions.py` の純粋関数で、形は次の3つ。未知の role は False（fail-safe）。`is_creator`/`is_uploader` はキーワード専用の引数。
  - **追加系**（`role in {"owner", "editor"}`）: `can_add_pin`・`can_add_pin_photo`・`can_add_pin_tag`・`can_update_pin_visited`・`can_move_pin_to`
  - **持ち主の判定系**（`role == "owner" or (role in {"owner", "editor"} and is_creator)`）: `can_update_pin`・`can_delete_pin`・`can_delete_pin_tag`・`can_delete_pin_photo`（`is_uploader`）・`can_update_pin_archived`・`can_move_pin_from`
  - **地図の管理系**（`role == "owner"`）: `can_update_sanpo_map`・`can_delete_sanpo_map`・`can_manage_sanpo_map_invitations`・`can_remove_sanpo_map_member`
- 式が同じでも、表の1行に1関数を対応させて流用しない（片方だけ変えるときに呼び出し側を直さずに済む）。2つの role を取る4つ目の形は作らない。
  メンバーの一覧・抜けるは `can_list_sanpo_map_members`・`can_leave_sanpo_map`。

### 決定2: 権限の表（旧 決定19・決定26・決定32・決定33・決定38・決定39・決定41）

ピン・タグ・写真（地図の中身）:

| 操作 | 地図 owner | editor（対象の作成者本人） | editor（作成者ではない） | 非メンバー・存在しない ID |
|---|---|---|---|---|
| ピンの追加 | ○ | ― | ○ | 404 |
| ピン本体の更新（`name`・`memo`） | ○（他人のピンも） | ○ | **403** | **404** |
| ピンの削除 | ○（他人のピンも） | ○（※1） | **403** | **404** |
| 訪問状況（`visited`） | ○ | ○ | ○ | **404** |
| アーカイブ状態（`archived`） | ○（他人のピンも） | ○ | **403** | **404** |
| ピンを地図から出す（移動元の role） | ○（他人のピンも） | ○ | **403** | **404** `pin_not_found` |
| ピンを地図に入れる（移動先の role） | ○ | ― | ○ | 移動先が **404** `sanpo_map_not_found` |
| タグの追加（`add_tags`） | ○ | ○ | ○ | **404** |
| タグの削除（`remove_tag_ids`） | ○（他人のタグも） | ○（自分が付けたタグ） | 自分が付けたタグだけ。他人のタグを含むと **403** | **404** |
| 写真の追加 | ○ | ○ | ○ | 404 |
| 写真の削除 | ○（他人の写真も） | ○（自分が上げた写真） | 自分が上げた写真だけ。他人の写真は **403** | **404** |

※1: editor が自分のピンを削除すると、他のメンバーがそのピンに付けた写真・タグも `ON DELETE CASCADE` で消える（ピン単位の削除である以上避けられない）。

地図そのもの・メンバー・招待:

| 操作 | 地図 owner | editor | 非メンバー・存在しない ID |
|---|---|---|---|
| 地図の閲覧・一覧 | ○ | ○ | 一覧に出ない / 404 |
| 地図の更新（名前・アイコン） | ○ | **403** | **404** |
| 地図の削除 | ○ | **403** | **404** |
| メンバーの一覧 | ○ | ○ | **404** |
| 他人を外す | ○ | **403** | **404** |
| 自分が抜ける | **409** `owner_cannot_leave` | ○ | **404** |
| 招待の発行・一覧・取り消し | ○ | **403** | **404** |
| 自分の表示の切り替え（`pins_visible`） | ○ | ○ | **404** |

- 地図の更新の権限は「送られたフィールド」で判定する（editor の `{}` は 200、同じ値でも `name`/`icon` を送れば 403）。権限の判定はフィールドの更新より前にまとめる。
- editor への 403 で情報は漏れない（editor は `GET /sanpo-maps` で地図を知っている）。共有地図の名前・存続は全員に影響するので owner に限る。

### 決定3: 404 と 403 の使い分け（IDOR 対策）（旧 決定9・決定21）

- **他人の地図・ピン・アップロード枠は存在を漏らさない。** 読み取りは必ず `user_id` を必須の引数に取り、`sanpo_map_members` との JOIN で絞る
  （`SanpoMapRepository` の読み取り、`PinRepository.get_for_member()`・`get_for_member_for_update()`・`list_for_member()`）。member でなければ 404。
- **member だが権限が無ければ 403**（`Permission denied`。`code` は付けない）。member はピンの存在を既に知っているので新しい情報は漏れない。mobile は「権限が無い」と「既に無い」を区別できる。
- 写真は `WHERE pin_id = :pin_id AND id = :photo_id` で取る（ID だけで引く経路を作らない）。ピンに属さない・存在しない写真はどちらも 404 `Pin photo not found`。
- アップロード枠は `user_id` を必須の引数に取り、他人の枠は「見つからない」扱い（確定では 409 `photo_upload_not_ready` に丸め、取り消しでは 404）。
  **招待が入っても、他人の枠を自分のピンに紐付けることはできない**（枠の持ち主 = アップロード者 = 容量の計上先）。
- S3 のキーはクライアントから受け取らない（[ADR-021](./ADR-021-pin-photo-upload-storage-and-delivery.md) 決定1）。presigned GET は DB で認可した写真にしか発行しない。
- 削除済みの ID への `DELETE` の再送は 404（冪等にしない）。mobile は 404 を成功と同じに扱ってよい。
- 判定の順は「認証（401）→ ボディの検証（422）→ member（404）→ 対象の存在（404）→ 権限（403）→ 件数などの競合（409）」。

### 決定4: メンバーの一覧・外す・抜ける。何も消さない（旧 決定38）

- **`GET /sanpo-maps/{id}/members`**: 要素は `user_id`・`display_name`（未設定は null。mobile は「メンバー」と出す）・`role`・`joined_at`（`sanpo_map_members.created_at`）。
  **メールアドレスと `photo_url` は返さない**（他の利用者に渡す情報を最小にする。ポリシー 1-8）。並びは owner → 参加日時の古い順 → `user_id`。メンバーは最大10人なのでページングしない。
- **`DELETE /sanpo-maps/{id}/members/{user_id}`**（204。非冪等）: 判定の順は「呼んだ人が member か（404 `sanpo_map_not_found`）→ 自分か他人か → 権限 → 対象」。
  自分なら editor は抜け、owner は 409 `owner_cannot_leave`（owner の引き継ぎは持たない）。他人なら owner だけが外せ、editor は対象の存在を見る前に 403（他人の membership を探らせない）。
  対象が member でなければ 404 `sanpo_map_member_not_found`。
- **外す・抜けるでは、メンバーの行だけを消す。** その人が追加したピン・写真・タグは地図に残る（作成者の FK は `users` を向いているので行は残る）。
  共有の地図の中身が、人が抜けるたびに欠けないようにするため。本人のアカウントは残るので、消したいものは抜ける前に自分で消せる（確認ダイアログでそう伝える）。
  アクセスを失った人の写真は、その人の容量に計上したまま（本人は消せない。消したいときはアカウント削除で消える）。
- 地図の行を `get_membership_for_update`（`FOR UPDATE`）でロックし、招待の受諾・地図の削除と直列化する。
- **この2つの API はフラグ `map_invitation` でガードしない**（フラグを OFF に戻しても抜けられるように）。置き場所は `sanpo_maps/maps/`。
- `DELETE` のパスに外す相手の内部 ID が載り、アクセスログに残る（[データ取扱い台帳](../privacy/data-inventory.md) 3.8）。ボディに移す案は、DELETE のボディの扱いがクライアントで揺れるので採らない。

### 決定5: 招待はリンク方式。1リンク1人・7日・受諾の明示（旧 決定39）

- **リンク方式で、運営者からメールを送らない。** owner が `POST /sanpo-maps/{id}/invitations` でリンクを作り、OS の共有シートで送る。
  - 却下: メール（SES）。Apple の非公開リレーや別の Google アカウントで照合できず、結局リンクを持つ人なら誰でも参加でき、第三者のアドレスの保存と送信の悪用対策が増える。
  - 却下: アプリ内のユーザー検索。利用者を他人から見つけられるようにすること自体がプライバシーの大きな変更。
- **URL は `https://sanposcape.com/i/#<token>`**（dev は `dev.sanposcape.com`。`INVITATION_URL_BASE`）。トークンを fragment に載せ、CloudFront のアクセスログ・LP に残さない。
- **トークンは `secrets.token_urlsafe(32)`（256 bit）。DB には SHA-256 の hex だけを保存し、発行の応答で1回だけ返す。** API はトークンを path・クエリに載せずボディで受ける。
- **1つのリンクで参加できるのは1人。期限7日。owner はいつでも取り消せる。** 地図ごとの上限はメンバー（owner を含む）10人・有効なリンク10件（409 `member_limit_reached`・`invitation_limit_exceeded`）。招待できるのは owner だけ。
- **参加は受諾画面で「参加する」を押したときだけ**（`POST /invitations/accept`）。リンクを開いただけでは参加しない（転送されたリンクで意図せず参加させない・名前が見えることへの同意を取る）。
- 受諾は「地図の行 → 招待の行」の順にロックする（`lock_map_for_update` → `get_active_for_update`）。すでに member なら招待を消費せずに 200 で同じ地図を返す（冪等）。
- **使えないトークン（存在しない・使用済み・取り消し済み・期限切れ）は理由を区別しない 404 `invitation_not_found`。**
- **preview（`POST /invitations/preview`）はサインイン不要**。地図の名前・アイコン・招待した人の表示名・期限と、サインインしていれば `membership` を返す。
- **発行・preview・受諾はフラグ `map_invitation` でガードする（403 `feature_disabled`）**。施行日より前に本番で招待を使えないようにするため。一覧・取り消しはガードしない。
  **ON にする条件に「ピンの移動の制限（決定6）を本番にデプロイしてから」を含む**（`core/feature_flags.py` の説明）。
- preview・受諾に IP・ユーザー単位のレート制限（既定 60 秒に 20 回・ゲストは 10 回。`ExploreRateLimiter` と同じ仕組み）。
- 使い終わった招待は 30 日後に消す（日次の写真の削除の Lambda に相乗り。[ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md) 決定5）。作った人のアカウント削除では CASCADE、参加した人の削除では `accepted_by_user_id` を SET NULL。
- 置き場所は `sanpo_maps/invitations/`（ADR-011 の SS-250 追補）。

### 決定6: ピンの移動は、移動先に移動元の全メンバーがいるときだけ（旧 決定42。決定33 の一部を改めた）

- **条件は「移動先のメンバー ⊇ 移動元のメンバー」。** 満たさなければ `PATCH /pins/{id}` は 403 `{"code": "move_target_missing_members"}`
  （`PinMoveTargetMissingMembersError`、`SanpoMapRepository.has_members_missing_from`）。role の 403 をすべて通った後に判定し、今の地図と同じ ID なら判定しない。
- 理由: 移動は無害と思われやすいが、移動元のメンバーが自分のピンや上げた写真を見られなくなり、写真は容量に計上されたまま消せない（決定4）。思わぬアクセスの喪失を防ぐ。
  旧 決定33 は「owner は削除できるのだから、より弱い移動を禁じると権限の強弱が逆転する」として許していたが、削除は確認を経るはっきりした操作なので区別する。
- **公開範囲が広がる移動（移動先にだけいる人がいる）は止めない**（移動する人は両方の member で自分で判断できる。mobile は「〇〇さんにも見えるようになります」と出す）。
- **招待中（未承諾）の人は数えない。**
- 同時のメンバーの変更: 移動先は地図の行の `FOR KEY SHARE` が受諾・外す・抜ける（`FOR UPDATE`）と衝突するので、確定した後のメンバーで判定する。
  移動元の地図の行はロックしない（ピン行の後に取ると地図の削除とデッドロックする）。移動元へ同時に参加した人は、参加の直後にピンが出ていくだけなので許容する。
- **候補は `GET /pins/{pin_id}/move-targets`**: 自分が member の地図のうち今の地図を除いたものを `GET /sanpo-maps` と同じ並びで、
  `{sanpo_map_id, missing_members, added_members}`（各メンバーは `{user_id, display_name}`）で返す。返す名前は呼んだ人が member の地図のメンバーだけ。
  置き場所は `sanpo_maps/pins/move_targets.py`。
- 却下: 「ピンに関わった人（作成者・写真やタグを付けた人）が移動先にいれば可」（見るだけで関わっているメンバーがいる）／`can_move` の真偽値だけを返す（理由の名前を出せない）。

### 決定7: 地図ごとのピンの表示・非表示は本人のメンバーシップに持つ（旧 決定41）

- **保存先は `sanpo_map_members.pins_visible`（`BOOLEAN NOT NULL DEFAULT true`）。** 「利用者 × 地図」の設定なので、既にその単位の行であるメンバーシップに持つ。
  - 却下: 地図の属性（共有地図で1人の選択が全員に効く）／別テーブル（寿命がメンバーシップと同じものを2か所で保つ）／端末に保存（課題が DB を求めている）。
- **`SanpoMapRead.pins_visible`（required）は本人の値。** 他のメンバーの値は返さない（メンバーの一覧にも載せない）。
- **変えるのは `PATCH /sanpo-maps/{id}/members/me`**（`SanpoMapMembershipUpdate {pins_visible?: bool}`。`extra="forbid"`・null は 422・`{}` は 200）。応答は `SanpoMapRead`。
  member なら role を問わず可。地図の行を `FOR UPDATE` でロックする。地図の `updated_at` は変えない。
- 抜けて入り直すと行が作り直されて表示に戻る（許容）。
- **API はフラグでガードしない。** mobile の UI と、非表示の地図のピンを出さない挙動はフラグ `map_pin_visibility` で包む。`GET /pins` は非表示の地図のピンも返す（表示は mobile が取りに行かないことで決める）。

## 検討した選択肢

主な却下案は各決定に書いた。全体に関わるもの:

- **権限の表を予定表のまま運用する**（旧 決定2）: BK-5（SS-112）の実装で、写真の削除の持ち主・タグの作成者の意味をはっきりさせた表に置き換えた。
- **抜ける・外すときにその人の追加物を消す**: owner が他人のピンに付けた写真・タグまで消え、地図が欠ける。

## 影響

### ポジティブな影響

- 招待で editor が入っても、権限の判定の経路は増えていない（role の行を足すだけ）。
- 他のメンバーに渡る個人の情報は、表示名・役割・参加日時に限られる。

### ネガティブな影響・トレードオフ

- アクセスを失ったメンバーの写真は、その人の容量に計上され続ける（上限 10 GiB に対して影響は小さい）。

### 持ち越し

- **ピンの作成と「外す」の競合**: ピン・写真・タグの追加は member の確認でロックを取らない（`get_membership`）ので、外す処理の commit と交差すると、外された直後にその人のピンが1件入りうる。
  新しい開示ではない（外された人の追加物は残る、の範囲）。直すなら作成の判定を `get_membership_for_key_share` に替える。
- iOS・Android の実機で、リンクからアプリが開くこと（Universal Links / App Links）を確かめていない。本番の Android の App Links は署名証明書の値が無く、ストアの準備まで検証が通らない。

## 関連情報

- 経緯の記録: [ADR-009（凍結）](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
- [ADR-019](./ADR-019-sanpo-map-and-pin-data-model-and-api.md)（データモデルと API）、[ADR-022](./ADR-022-deletion-and-photo-object-cleanup.md)（アカウント削除のときの共有地図のデータ）
- [ADR-011](./ADR-011-sanpo-maps-module-structure.md)（`invitations` サブパッケージ・公開面）
- [データ取扱い台帳](../privacy/data-inventory.md) 3.8（地図のメンバー）
- mobile: [ADR-M-014](../../packages/mobile/adr/ADR-M-014-sanpo-map-list-and-detail.md)（メンバー・招待）、[ADR-M-017](../../packages/mobile/adr/ADR-M-017-pin-edit-and-delete.md)（編集・移動）、[ADR-M-021](../../packages/mobile/adr/ADR-M-021-pin-visit-status-and-archive.md)（表示の切り替え）
- Plane: SS-90、SS-112、SS-113、SS-192、SS-248、SS-249、SS-250、SS-266
