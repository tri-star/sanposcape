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
- **`GOOGLE_MAPS_SERVER_API_KEY` が空だと `dev-up.sh` が止まる。** 地図・ピンの確認だけなら `MAPS_MODE=fake` でよいが、
  **`packages/*/.env` への書き込みは権限設定で Edit・シェルの両方が拒否される。** ユーザーに
  `! sed -i 's/^# MAPS_MODE=real$/MAPS_MODE=fake/' packages/backend/.env` を実行してもらう。
- ピンを見たい場所に `ui.sh geo <lat> <lng>` で現在地を合わせてからログインすると、ピンタブが最初からその周りを表示する。

**How to apply:** 見た目の確認でデータが要るときは、最初に dev-session + API でまとめて作る。`.env` を変える必要があれば、先にユーザーへ `!` のコマンドを渡す。
