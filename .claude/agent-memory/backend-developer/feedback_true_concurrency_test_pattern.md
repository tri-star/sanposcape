---
name: feedback_true_concurrency_test_pattern
description: threading.Thread + 別Session（TestSessionLocal）で実DBの行ロックを再現し、真に同時な冪等リトライのフォールバック処理を検証する手順。ORMオブジェクトをスレッド間で共有しない
metadata:
  type: feedback
  scope: durable
---

SS-88（`pins/service.py`の写真付き`create_pin`冪等リトライ、レビューR1）で書いた回帰テストの
パターン。既存の`walks/tests/test_repository.py::TestDeleteConcurrentRace`・
`auth/tests/test_repository.py::test_get_by_hash_for_update_blocks_concurrent_transaction`と
同じ手法だが、サービス層（DB以外の処理を含む）でこの手法を使う際に踏んだ落とし穴を記録する。

**Why:** 「真に同時なリクエストが相手の行ロックでブロックされ、解放後に再確認したら状態が
変わっていた」というシナリオは、単一セッションの逐次呼び出しでは絶対に再現できない
（2回目の呼び出しが1回目の未コミット状態を待つ、というタイミングそのものが本質のため）。
モックで済ませると「本当に行ロックで待たされているか」を検証できず、フォールバック処理を
書いたつもりで実は到達しないコードパスを書いてしまうリスクがある。

**How to apply:**
- `from sanposcape.conftest import TestSessionLocal` を使い、holder/waiter それぞれに
  **別の`Session`（=別コネクション）** を割り当てる。`threading.Event`（`holder_locked`/
  `holder_may_commit`）でholderが行ロックを取得した直後に一時停止させ、waiterを開始した後に
  `time.sleep(0.3)`で「waiterが実際にブロックされていること」を確認してから
  `holder_may_commit.set()`する（早期完了は競合の再現に失敗している証拠）。
- **ORMオブジェクト（`User`等）をスレッド間で共有しない。** メインスレッドの`db_session`で
  作った`User`インスタンスをそのままholder/waiterのクロージャに渡すと、`commit()`後に
  属性がexpireされ、別スレッドから属性アクセス時に元の`db_session`へ暗黙のSELECTが飛んで
  スレッド安全性が壊れる（SQLAlchemyのSessionはスレッドセーフではない）。必ず
  `user_id`（UUID等のプリミティブ値）だけをクロージャに渡し、各スレッド内で
  `session.get(User, user_id)`のように**そのスレッド専用のSessionで再取得**する。
- holder側で「1回目のリクエストが確定処理を終えてcommitする直前」を模す場合、実際の
  `PhotoAttacher`（S3 I/O）を経由する必要はない。検証したいのはrepository層の行ロックが
  waiter側の`_prepare_photos`を実際にブロックし、解放後に正しい状態（`status="attached"`）を
  読めることだけなので、`PinRepository.add_photos()`にテスト用にでっち上げた`PreparedPhoto`
  （S3キーは適当な文字列でよい）を直接渡してDBだけを更新すれば十分。
- Coreの`update()`文（`mark_attached()`等）はORMの識別子マップと同期しないため、
  「同一セッション内で更新した直後に、更新前に取得済みのORMオブジェクトへ`session.refresh()`
  し忘れる」と、呼び出し元が古い属性値（例: `status="pending"`のまま）を見てしまい、
  意図したコードパス（例外送出）に到達しない。`lock_for_attach()`のような「行を取得して
  返す」メソッドをテスト用にmonkeypatchして途中でCore updateを挟む場合は、返す直前に
  `db_session.refresh(obj)`を呼んで最新値を反映させること。
