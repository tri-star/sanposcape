---
name: middleware-ordering-and-413
description: core/middleware.pyのRequestSizeLimitMiddlewareはHTTPメソッド非依存（GET/DELETEでも413があり得る、再指摘しない）。AccessLogMiddlewareはcreate_app()で最後に登録して最外層に置く（回帰テストあり）。
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

## RequestSizeLimitMiddleware はメソッド非依存（SS-53）

`packages/backend/src/sanposcape/core/middleware.py::RequestSizeLimitMiddleware` は
`scope["method"]` を見ず、`scope["path"]` が `path_prefix`（完全一致 or `prefix + "/"`）に
マッチすれば全メソッドで (1) Content-Length 詐称のファストパス、(2) ストリーミング受信量、の
両方で413を返す。そのため GET/DELETE でも413はあり得る。

SS-53 の PR #47 対応で `walks/router.py` は GET/DELETE を含む全エンドポイントを
`_ERROR_RESPONSES`（401+413）に統一した。middleware にメソッドフィルタを足す案は、
「汎用ミドルウェアにメソッド知識を持たせず、ヘッダー詐称も含めて防御する」安全側の挙動を
保つため見送られた。**「GET/DELETEに413があるのはおかしい」という指摘はしないこと。**

- 同ミドルウェアを新しい `path_prefix` に適用するドメインでは、router の `responses` にも
  一律で413を含めているか確認する。
- middleware 側に `scope["method"]` のフィルタが追加されたら、この決定が覆ったのでこのメモを更新する。
- GET に偽 Content-Length を付けてフルアプリ経由で413を確認する end-to-end テストは無い
  （`core/tests/test_middleware.py` のユニットテストのみ）。厳密性を求めるなら Suggestion で指摘してよい。

## AccessLogMiddleware は最後に登録する（SS-88 追補）

`main.py::create_app()` は `AccessLogMiddleware`（`core/observability.py`）を**必ず最後に**
`add_middleware()` する。Starlette の `add_middleware` は先頭挿入なので、最後に登録して初めて
最外層になり、`RequestSizeLimitMiddleware` が自前で返す413をアクセスログに記録できる
（ADR-009 決定13、`docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md`）。
この順序は `tests/test_main.py::test_access_log_records_the_413_returned_by_the_size_limit_middleware`
で固定されている。

- `create_app()` に新しいミドルウェア登録が追加されたPRでは、`AccessLogMiddleware` が引き続き
  最後に登録されているか、上のテストが消されたり弱められたりしていないかを確認する。

関連: [[backend-layering-conventions]]
