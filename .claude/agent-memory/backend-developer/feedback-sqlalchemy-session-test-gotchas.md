---
name: feedback-sqlalchemy-session-test-gotchas
description: SQLAlchemy のセッションまわりでテストが嘘をつく罠。別セッションの削除を identity map が隠す / commit 後の expire / サービス直呼びの明示 rollback / スレッド＋別 Session で真の行ロック競合を再現する手順
metadata:
  type: feedback
  scope: durable
---

SS-88・SS-112・SS-113 の実装で踏んだ、「テストが通る／落ちる理由が実装と無関係」になる SQLAlchemy の罠と、
真の並行競合を再現するテストの手順。

**Why:** どれも本番の挙動ではなくテスト側のセッション管理が原因で、緑のテストが回帰を見逃したり、
赤のテストが存在しないバグを指したりする。原因に気付くまでの調査コストが大きい。

**How to apply:** DB を触るテストで、別セッション・commit 後のアクセス・例外後の状態・同時実行を扱うときに
該当する節を確認する。

## 1. HTTP 経由の削除を `db_session.get()` で確認しない

router のテスト（`override_get_db` で別セッションを使う TestClient）で DELETE を叩いた後、
先に読み込み済みの `db_session` に `.get(Model, id)` すると次の2通りで失敗する。

- identity map のキャッシュが返り、実際は消えているのに `is None` が失敗する。
- `expire_all()` を挟むと、期限切れオブジェクトの再照会が0件になり `ObjectDeletedError` が出る。

`sanposcape.conftest.TestSessionLocal()` で新しいセッションを開いて `.get()` する（使い終わったら `close()`）。
`sum_attached_bytes()` のような集計 SELECT は identity map を経由しないので罠に当たらない
（`sanpo_maps/maps/tests/test_sanpo_map_management.py` の `test_capacity_is_freed_after_deletion` で確認済み）。

## 2. commit 後の ORM 属性アクセスは「delete した本人か」で挙動が違う

既定の `expire_on_commit=True` のもとで:

- `session.delete(obj)` した対象は commit 後に expunge される。`obj.id` などは新規クエリ無しで読める。
- delete していない persistent オブジェクト（`current_user`、写真だけ消した `pin` など）は commit 後に expire され、
  次のアクセスで SELECT が飛ぶ。行が消えていれば `ObjectDeletedError`、残っていれば気付きにくい無駄な SELECT。

commit 後に使う値（`s3_key`・`byte_size`・`user_id` など）は commit 前にローカル変数へ控える。テストでも
検証に使う値は削除メソッドを呼ぶ前に控える。backend-code-quality-reviewer の
[[pattern_expired_orm_attr_in_post_commit_log]] が同じ論点。

## 3. サービスを直接呼ぶテストで例外後のロールバックを検証するときは `db_session.rollback()` を明示する

HTTP 経由なら `get_db()` の `finally: db.close()` が未コミット分を暗黙に破棄するが、サービス直呼びでは通らない。
`flush()` 済み・未 commit の変更は同一トランザクション内で見え続けるので、`pytest.raises(...)` の後に
`db_session.rollback()` してから検証する（`sanpo_maps/pins/tests/test_service.py` の
`TestPinServiceObjectStorageFailure` に同パターンあり）。

## 4. 真に同時なリクエストの行ロック競合を再現する（threading + 別 Session）

「相手の行ロックで待たされ、解放後に再確認したら状態が変わっていた」は単一セッションの逐次呼び出しでは再現できない。
モックで済ませると、到達しないフォールバック処理を書いてしまう。既存例は `walks/tests/test_repository.py` の
`TestDeleteConcurrentRace`、`auth/tests/test_repository.py` の
`test_get_by_hash_for_update_blocks_concurrent_transaction`。

- holder / waiter にそれぞれ `TestSessionLocal()` の別 Session（＝別コネクション）を割り当てる。
  `threading.Event`（`holder_locked` / `holder_may_commit`）で holder をロック取得直後に止め、waiter 開始後に
  `time.sleep(0.3)` で waiter が実際にブロックされていることを確かめてから `holder_may_commit.set()` する
  （waiter が先に終わったら競合の再現に失敗している）。
- **ORM オブジェクトをスレッド間で共有しない。** メインスレッドの `User` を渡すと commit 後の expire で元の
  `db_session` へ暗黙の SELECT が飛び、スレッド安全性が壊れる。UUID などのプリミティブだけを渡し、各スレッドで
  `session.get(User, user_id)` し直す。
- holder 側で「1回目のリクエストが確定直前」を模すなら、S3 I/O を経由せず `PinRepository.add_photos()` に
  テスト用の `PreparedPhoto` を直接渡して DB だけ更新すれば足りる。
- Core の `update()` 文（`mark_attached()` 等）は identity map と同期しない。`lock_for_attach()` のような
  「行を取得して返す」メソッドを monkeypatch して途中で Core update を挟むなら、返す直前に
  `db_session.refresh(obj)` する（忘れると古い `status` を見て意図したコードパスに到達しない）。
