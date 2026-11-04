---
name: emulator-seed-data
description: エミュレータ確認用のデータを API で作る手順 — POST /auth/dev-session（AUTH_MODE=dev）でトークンを取り、地図・ピンを curl/urllib で作る。サーバーの Maps キーが無いときは MAPS_MODE=fake だが、.env はエージェントから書けないのでユーザーに `!` で書いてもらう
metadata:
  type: feedback
  scope: durable
---

新しい worktree の backend の DB は空で、地図・ピンの見た目を確かめるには地図とピンが要る。UI で13個作ると遅い。

- **`AUTH_MODE=dev` のとき `POST /auth/dev-session` に `{"user_key": "dev-user-1"}` を送るとトークンが返る**（`access_token`。OpenAPI には載らない）。
  mobile の `.env` の `EXPO_PUBLIC_DEV_USER_KEY` と同じ値にすると、アプリで「Google でログイン」を押した開発ユーザーと同じ人になる。
  `POST /sanpo-maps`（`{name, icon}`）・`POST /pins`（`client_pin_id`（UUID）・`sanpo_map_id`・`name`・`location`）で作れる。
  python の `urllib` で書くと依存が要らない。backend へは sandbox の外から叩く（`localhost:<BACKEND_API_PORT>`）。
  ピンには `memo`・`tags`（文字列の配列）も付けられる。アーカイブ済みは作成時に指定できないので、作った後に `PATCH /pins/{id}` に `{"archived": true}` を送る。
- **`GOOGLE_MAPS_SERVER_API_KEY` が空だと `dev-up.sh` が止まる。** 地図・ピンの確認だけなら `MAPS_MODE=fake` でよいが、
  **`packages/*/.env` への書き込みは権限設定で Edit・シェルの両方が拒否される。** ユーザーに
  `! sed -i 's/^# MAPS_MODE=real$/MAPS_MODE=fake/' packages/backend/.env` を実行してもらう。
- ピンを見たい場所に `ui.sh geo <lat> <lng>` で現在地を合わせてからログインすると、ピンタブが最初からその周りを表示する。
- **写真付きのピン**（SS-261 の LP の画面）: `POST /pin-photo-uploads`（`content_type: image/jpeg`・`byte_size`）の応答の `upload.url` に、`upload.fields` と `file` を multipart で POST する（`STORAGE_MODE=fake` でも 204）。
  返った `upload_id` を `POST /pins` の `photo_upload_ids` に入れる。JPEG しか受け付けないので PNG は PIL で変換する。LP の画面に使ったイラストは `packages/lp/design-assets/illustrations/`（JPEG）にある。`PATCH /pins/{id}` では位置を変えられないので作り直す（タグは `add_tags`・`remove_tag_ids` の差分で、訪問済みは `visited` で変えられる）。一覧は新しい順なので、上に出したいピンは最後に作る。
- **表示名は `dev-session` のたびに user_key に戻る。** アプリの「Google でログイン」も dev-session を呼ぶ。メンバー画面に読める名前を出すなら、ログインした後に
  `docker compose ... exec -T db psql ... -c "UPDATE users SET display_name = ... WHERE display_name = 'dev-user-1'"` で書き換え、`ui.sh restart` でキャッシュを捨てる（restart は refresh で入り直すので名前は戻らない）。
- **招待で2人目以降を参加させる**: 作った人のトークンで `POST /sanpo-maps/{id}/invitations` → 応答の `token` を、別の user_key のトークンで `POST /invitations/accept` に送る。
- **ピンの詳細には逆ジオコーディングの住所が番地まで出る。** 外に出す画面（LP など）では、架空のお店が実在の住宅にあるように見えないよう、`POST /explore/reverse-geocode` で先に住所を確かめ、寺・公園などの敷地の座標にする。
- 画面へは `ui.sh open pins/<id>`・`ui.sh open sanpo-maps/<id>/members` のようにディープリンクで直接飛べる。地図の長押しは `ui.sh swipe X Y X Y 1200`。

**How to apply:** 見た目の確認でデータが要るときは、最初に dev-session + API でまとめて作る。`.env` を変える必要があれば、先にユーザーへ `!` のコマンドを渡す。
