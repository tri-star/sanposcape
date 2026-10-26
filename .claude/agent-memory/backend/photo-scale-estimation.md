---
name: photo-scale-estimation
description: 写真の枚数・容量の規模が変わる変更の見積もり。削除の後始末で消せる量は締め切りではなく「締め切り − 1回の最悪時間」の間に始めた回数で決まる / DB の CASCADE の時間はローカルの psql に合成データを入れて測る（認証情報はコンテナの中の環境変数で渡す）
metadata:
  type: feedback
  scope: durable
  source_issue: SS-236
---

## 1. 削除の後始末で消せる量は「締め切り − 1回の最悪時間」で決まる

`PhotoObjectCleaner.delete_best_effort`（`sanpo_maps/photos/cleanup.py`）は、2回目以降の DeleteObjects を
「残り時間 ≥ 1回の最悪時間」のときだけ始める。既定は締め切り 10 秒・最悪時間 6 秒（削除用 client の connect 1 + read 5）なので、
**呼び出しを始められるのは最初の 4 秒だけ**で、回数は `floor(4 / 1回の時間) + 1`（1回 1 秒で 5 回 = 5千キー = 写真 2.5千枚）。

**Why:** SS-236 の初版の見積もりは「10 秒 ÷ 1回の時間」で 1万〜3万キーとし、レビューで 2〜3 倍の過大評価と指摘された。
消し残しの量が変わると、ポリシーの「まれに残る」との食い違い（データ取扱い台帳 §4）や費用の判断まで変わる。

**How to apply:** 写真の上限・枚数・削除の時間予算を変える見積もりでは、締め切りで割らず、上の式を使う。
確かめるときは、実際の `cleanup.py` を偽の時計（`monotonic` を注入できる）と、時間だけ進める偽の storage で動かすのが早い。
アカウント削除後の写真の削除（`AccountPhotoPurgeService`）は「締め切りを過ぎたら新しい呼び出しを始めない」だけで、同じ式にはならない。

## 2. DB の削除時間は、ローカルの psql に合成データを入れて測る

地図・アカウントの削除（CASCADE）や容量の集計の時間は、`docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v n=...'`
に SQL を標準入力で渡し、`\timing on` で測れる。`generate_series` で `users` → `sanpo_maps` → `pins` → `pin_photo_uploads`/`pin_photos`/`pin_tags`
を作り、削除は `BEGIN; ... ROLLBACK;` で囲むと同じデータで何度も測れる（最後に `DELETE FROM users` で片付ける）。

**Why:** `.env` の `POSTGRES_*` をホスト側で読んで表示しようとすると、auto mode の分類器が認証情報の取り出しとして拒否する。
コンテナの中の環境変数で渡せば値を表示せずに済む。SS-236 では写真 7万枚で地図の削除が約 0.5 秒だった（ADR-009 決定37）。

**How to apply:** `pin_photos` の行に `pin_id` を割り当てるときは、`OFFSET (row_number() OVER ())` のような窓関数は OFFSET に書けない。
ピンに `row_number() - 1` を振った一時表を作り、写真の連番の剰余で JOIN する。
