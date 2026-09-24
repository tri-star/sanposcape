---
name: pattern_expired_orm_attr_in_post_commit_log
description: commit()後にexpire_on_commit=TrueでORM属性が失効し、ログ出力のためだけに不要なSELECTが飛ぶパターン。SS-112 pins/service.pyのdelete_pin/delete_photoで発見。
metadata:
  type: reference
  scope: durable
---

`packages/backend/src/sanposcape/database.py:32` の `sessionmaker(bind=..., autoflush=False,
autocommit=False)` は `expire_on_commit` を明示していないため既定値 `True` のまま。つまり
`session.commit()` は、削除されていない（persistent な）オブジェクトの属性をすべて失効させる。
`get_pin_service` / `get_user_service`（`dependencies.py`）はどちらも `Depends(get_db)` から
同一の `Session` を受け取るため、`get_current_user` でロードされた `User` インスタンスも
`PinService` 側の `self._db.commit()` で一緒に失効する。

SS-112 の `pins/service.py::delete_pin()` / `delete_photo()` は、`self._db.commit()` の直後の
`logger.info(...)` で `pin.id` / `current_user.id` / `photo.id` を参照している。`pin`（`delete_photo`
の場合）と `current_user` はどちらも削除対象ではない persistent オブジェクトなので、commit 後の
属性アクセスが「このオブジェクトを再読込する SELECT」を1回誘発する（ログを出すためだけに
`pins`/`users` テーブルへ余計な往復が発生する）。`update_pin()` の `self._require_read_model(pin.id)`
（commit直後に `pin.id` へアクセス）も同型（ただしこちらは既存の `create_pin()` からの踏襲パターン）。

対照的に、同じファイルの `PinPhotoUploadService.create_upload()`（ログには `upload_id`/`key`
というローカル変数だけを使い、`upload.id` 等のORM属性には触れない）と `delete_upload()`
（`s3_key = upload.s3_key` を commit 前にローカル変数へ退避する）は、この問題を意図的に
回避する慎重なパターンを確立している。

なお「削除された（`session.delete()` された）オブジェクト」自体は commit 後に expire では
なく expunge（detach）されるため、`pin.id`（`delete_pin()` で pin 自体を削除したケース）への
アクセスは新規クエリを誘発しない（値はメモリ上にそのまま残る）。問題になるのは「削除して
いない、しかし同じセッションで touch した persistent オブジェクト」（`current_user`、
または delete_photo における `pin`）の方。

**How to apply:** `self._db.commit()` の後に書かれた `logger.info/warning` 呼び出しで、
ORM モデルの属性（`obj.id` 等）を直接参照していたら、そのオブジェクトが「今回のトランザクション
で明示的に `session.delete()` された対象」かどうかを確認する。削除対象でなければ、commit 前に
必要な値をローカル変数へ退避するか、既に引数として渡されている ID（例: `pin_id`/`photo_id`
パラメータ）をそのままログに使うよう提案する。関連: [[pattern_select_then_delete_race]]
（同じ「削除まわりのSQLAlchemyの罠」系）。
