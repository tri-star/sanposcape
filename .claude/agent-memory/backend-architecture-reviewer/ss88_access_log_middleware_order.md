---
name: ss88_access_log_middleware_order
description: SS-88追補のAccessLogMiddleware順序制約(413を観測するには最後に登録)がコメントのみで固定するend-to-endテストが無い
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
  verify_by: 2026-12-31
---

`packages/backend/src/sanposcape/main.py::create_app()` は `AccessLogMiddleware`
（`core/observability.py`、2026-09-24追加、ADR-009決定13）を**必ず最後に**
`add_middleware()` する設計。Starletteの `add_middleware` は先頭挿入なので、最後に
登録して初めて最外層になり、`RequestSizeLimitMiddleware` が返す413を観測できる。

**（2026-09-24 解消済み）** レビュー指摘を受けて
`test_main.py::test_access_log_records_the_413_returned_by_the_size_limit_middleware`
を追加した。`TestClient(create_app(settings))` で `/pin-photo-uploads` に上限超過の本文を
送り、413応答とアクセスログの `-> 413` が一致することを確認する。意図的に登録順を崩すと
このテストが落ちることも実地に確認済み。以下は当時の状況の記録。

当時、この制約は `main.py` と `observability.py` 両方にコメントで明記されているだけで、
`create_app()` 経由でスタックした状態（TestClient）で「413のときアクセスログにも413が
記録される」ことを固定する回帰テストが無かった。
`test_main.py::test_explore_size_limit_stops_chunked_body_without_content_length` は
`RequestSizeLimitMiddleware` 単体、`core/tests/test_observability.py` の
`TestAccessLogMiddleware` は `AccessLogMiddleware` 単体のテストで、スタック順は
どちらもカバーしていない。

**Why:** 将来誰かが新しいミドルウェアを `AccessLogMiddleware` の後に登録してしまうと、
413のケースだけアクセスログのステータスが実際の応答とずれて記録される。これは今回の
変更（本番でどのステータスが返ったか分からない問題への対処）の再発になり得るが、
テストが無いと静かに壊れる。

**How to apply:** `main.py::create_app()` に新しいミドルウェア登録が追加されたPRを見たら、
`AccessLogMiddleware` が引き続き最後に登録されているかを確認する。上の回帰テストが
落ちていれば順序が崩れている。テスト自体を消す/書き換える変更にも注意する。

関連: [[backend-layering-conventions]], [[ss53-request-size-limit-middleware-method-agnostic]]
