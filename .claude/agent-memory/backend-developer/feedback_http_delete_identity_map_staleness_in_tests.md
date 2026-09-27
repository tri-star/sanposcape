---
name: feedback-http-delete-identity-map-staleness-in-tests
description: HTTP経由の削除を別セッションで確認するテストは、呼び出し元db_sessionのidentity mapが古い状態を返す/ObjectDeletedErrorになる罠。TestSessionLocal()の新規セッションで確認する
metadata:
  type: feedback
  scope: durable
  source_issue: SS-113
---

router のテスト（`fake_storage_client`/`client` 等、`override_get_db` で別セッションを使う
TestClient）で `DELETE` 系エンドポイントを叩いた後、同じテスト関数内で先に
repository/`db_session` 経由でオブジェクトを読み込み済みの `db_session` に対して
`db_session.get(Model, id)` で「消えたこと」を確認すると、2種類の失敗が起きる。

1. 単に `db_session.get(...)` が identity map のキャッシュを返し、`is None` の検証が
   （実際には消えているのに）失敗する。
2. `db_session.expire_all()` を挟んでから `.get()` すると、期限切れオブジェクトの再照会が
   0件になり、SQLAlchemy は `None` ではなく `sqlalchemy.orm.exc.ObjectDeletedError` を送出する
   （`.get()` の「identity map にあれば問い合わせない」設計と「期限切れなら再照会する」設計の
   組み合わせによる罠）。

**Why**: HTTP 経由の DELETE は `override_get_db`（テスト用）が発行する別セッションで commit
される。呼び出し元の `db_session` は自分のトランザクション内で以前 SELECT/INSERT した
オブジェクトを identity map に持ち続けており、明示的に expire/再クエリしない限り、別セッションの
commit を認識しない。

**How to apply**: HTTP 経由の削除やクロスセッションの副作用を確認するテストでは、
`sanposcape.conftest.TestSessionLocal()` で新しいセッションを開いて `.get()` する（使い終わったら
`close()`）。`sum_attached_bytes()` のような集計 SELECT（identity map を経由しない生クエリ）は
READ COMMITTED のもとで新しい文ごとに最新状態を読むため、この罠に当たらない
（`pins/tests/test_sanpo_map_management.py::TestDeleteSanpoMapCascade::
test_capacity_is_freed_after_deletion` で確認済み）。罠に当たるのは `Session.get()`（主キー
指定の ORM ロード）だけ。
