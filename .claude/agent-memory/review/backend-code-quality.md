---
name: backend-code-quality
description: backend のコード品質・設計のレビュー観点。偽 N+1（identity map）と本物の N+1（add_all 後のループ refresh）、commit 後のログでの ORM 属性、閲覧 API の型（JOIN 認可・バッチ取得・commit しない）、クエリの日時は AwareDatetime、設計根拠の裏取り、計画書ラベルのコメント、冪等 INSERT
metadata:
  type: feedback
  scope: durable
---

規約そのもの（3層・命名・テストの置き場所・例外ハンドラー・冪等 INSERT・TestClient の with）は `packages/backend/docs/folder-structure.md` と
`naming-convention.md` が正本。ここには、正本に照らして「どこを疑うか・どこを疑わないか」を置く。

## 1. 同じ PK の取得が2回に見えても、N+1 とは限らない（identity map）

認可チェック（`get_for_member()` が `select(Pin, SanpoMapMember.role)`）の直後に `self._db.get(Pin, pin_id)` があっても、同じセッションの identity map に
載っていれば追加の SQL は出ない（SS-111 の `pins/service.py::get_pin()`）。

**How to apply:** 間に `populate_existing()` や別セッションが無ければ、2回目はラウンドトリップが無い可能性が高い。指摘する前に SQL ログで確かめるか、
重要度を Low / Suggestion に留める。ループ内のクエリ（本物の N+1）と混同しない。

## 2. `add_all()` → `flush()` の後のループ `refresh()` は本物の N+1

SQLAlchemy 2.0 + psycopg は複数行の INSERT でも RETURNING でサーバー生成値（`created_at` など）を flush 時点で埋める。各要素に `refresh()` を
ループで呼ぶと、取得済みの値を1件ずつ SELECT し直す（SS-88 の `add_photos()`/`add_tags()`）。単一の `create()` が1回だけ呼ぶ `refresh()` は既存の型で問題ない。

**How to apply:** `add_all([...]); flush(); for x in ...: refresh(x)` を見たら、サーバー側で生成されて Python 側の値と異なるものがあるかを確かめ、
無ければ削除を提案する。

## 3. commit の後のログで、削除していない ORM オブジェクトの属性を読んでいないか

`expire_on_commit=True`（既定）なので、commit の後に `current_user.id` や（写真だけ消した）`pin.id` を読むと、ログのためだけに再 SELECT が飛ぶ。
`session.delete()` した対象は expunge されるので飛ばない（SS-112 の `delete_pin()`/`delete_photo()`）。

**How to apply:** commit の後の `logger.*` で ORM の属性を直接参照していたら、その対象が今回 delete したものかを確かめ、そうでなければ commit 前に
ローカル変数へ控えるか、引数の ID を使うよう提案する（お手本: `sanpo_maps/photos/service.py` の `PinPhotoUploadService`）。

## 4. 閲覧 API（`sanpo_maps/pins/` 配下）が踏襲すべき型

SS-111 で確立した（閲覧 API の決定は ADR-009 決定14〜18）。
- **認可は JOIN で絞った取得**: `sanpo_maps/pins/repository.py` の `get_for_member()`（ロックなし）と `get_for_member_for_update()` が `_member_pin_stmt()` を共有する。
  `user_id` 無しで引ける取得口を新設していたら指摘する。
- **一覧は「本体1 + 付随情報 N 種類のバッチ取得」**: ページ内の `pin_ids` に `IN (...)` でまとめて取る（`list_tags_for_pins`・`get_cover_photos`・`count_photos_for_pins`）。ループ内のクエリは指摘する。
- **keyset カーソルは型別のユーティリティ**（`core/pagination.py` の `(datetime, uuid)` 用と `(int, uuid)` 用）。新しいキーの型はこの並びに足す。
- **閲覧系の service メソッドは commit しない**（書き込み系だけが commit 境界を持つ）。

## 5. クエリパラメータの日時も `AwareDatetime` か

ボディの日時は `AwareDatetime` で naive を 422 にしているのに、クエリパラメータは素の `datetime` になりがち（SS-18 の `GET /walks`。今は修正済み）。
naive な値が `timestamptz` 列の比較に渡ると、DB セッションのタイムゾーン次第で境界がずれる。

**How to apply:** 新しいエンドポイントで日時をクエリで受けていたら `AwareDatetime` かを確かめる。列が `timezone=True` かとセットで見る。

## 6. 設計根拠の「循環 import を避けるため」は grep で確かめる

SS-98 のプランは「core 側に置くと循環 import になる」と説明していたが、実際は core → integrations の一方向で循環しなかった（ADR-008 の SS-98 追補 D3 で訂正済み）。
**How to apply:** import の向きを根拠にした配置の説明は、実際の import 方向を grep で確かめてから評価する。あわせて、`app.state` に外部クライアントを
持たせる実装では `_lifespan` の finally から `close()` が呼ばれているかを見る（先例: `HttpGoogleMapsProvider`・`AppConfigFlagSource`）。

## 7. コメントの計画書ラベル（`D6`・`Q3`・`B-D5`）

規則は `docs/knowledge-management.md`「層をまたぐ参照ルール」（コードのコメントから計画書の決定コードを参照しない）。CI（check-tmp-references.sh）は `.py` を見ない。
既存のコードに多く残っている（2026-10-12 時点で `src/` に `B-D\d+` が14箇所、`（D\d+`/`（Q\d+` が18箇所）。
**How to apply:** 新しいコードで見つけたら、コメントだけで意図が自己完結していれば Low / Suggestion、計画書ラベルしか手掛かりが無ければ Medium で
「ADR の決定番号で参照するか、自己完結させる」を提案する。既存の踏襲なので、その PR 固有の問題として厳しく扱いすぎない。

## 8. 冪等 INSERT（savepoint + `IntegrityError`）

型は folder-structure.md。レビューで見る残りの1点: 再送されたペイロードの中身が既存行と食い違っていても検証せず、既存行を返すだけになっている
（users / walks はこの前提）。新しいドメインで同じ型を使うときは、内容の不一致を握りつぶしてよいかを確かめる。

関連: [[backend-concurrency-and-locking]] [[security-backend]]
