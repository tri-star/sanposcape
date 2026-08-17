---
name: ss53-request-size-limit-middleware-method-agnostic
description: RequestSizeLimitMiddlewareはHTTPメソッドを見ずpath_prefixのみでContent-Length/ストリーミングサイズを判定する設計。GET/DELETEでも413があり得る
metadata:
  type: project
---

`packages/backend/src/sanposcape/core/middleware.py::RequestSizeLimitMiddleware` は
`scope["method"]` を一切参照せず、`scope["path"]` が `path_prefix`（完全一致 or
`prefix + "/"`）にマッチすれば全HTTPメソッドに対して以下を行う:

1. Content-Length ヘッダーが `max_bytes` を超えていれば即413（実際にボディを送らなくても
   ヘッダー詐称だけで到達できるファストパス）
2. ストリーミング受信バイト数が `max_bytes` を超えれば413（`limited_receive` ラッパー）

このため `GET`/`DELETE` のようにボディを持たないエンドポイントでも、理論上 413 になり得る。
SS-53のPR #47指摘対応（コミット b585bfa/36cec95）で、`walks/router.py` は
`_ERROR_RESPONSES_NO_BODY`（401のみ）を廃止し、GET/DELETE含む全エンドポイントを
`_ERROR_RESPONSES`（401+413）に統一した。middleware側でGET/DELETEを対象外にする
（method フィルタを足す）案は見送られた——理由は、汎用ミドルウェアにメソッド知識を
持たせず「ヘッダー詐称も含めて防御する」現状の安全側の挙動を維持しつつ、router.py側の
ドキュメント（OpenAPIコントラクト）を実態に合わせる方が変更が小さく安全、という判断。

**Why:** この設計は意図的なトレードオフ（安全側の防御 > メソッドごとの厳密なドキュメント
最小化）であり、今後 walks/explore 以外のドメインで同ミドルウェアを使う場合も同じ理由で
GET/DELETE を含む全メソッドに413を書くのが正しい。「GET/DELETEにも413があるのはおかしい」
という指摘は的外れなので再度しないこと。

**How to apply:** 同ミドルウェアを新しいpath_prefixへ適用するドメインが出てきたら、
そのrouterの`responses`にも一律で413を含めるよう確認する。逆にmiddleware.py側に
`scope["method"]`によるフィルタが追加された場合は、この決定が覆ったことを意味するので
このメモリを更新すること。

なお、この挙動（GET/DELETEでの413）を実際にend-to-endで踏むテスト（フルアプリ経由でGET
に偽Content-Lengthを付けて413を確認するテスト）はSS-53時点では存在せず、根拠は
`core/tests/test_middleware.py`のpath限定ユニットテスト（method非依存の実装なのでカバー
自体はできている）のみ。レビュー時に厳密性を求めるなら「router.py側のコメントの主張を
裏付けるend-to-end回帰テストがない」点はSuggestionとして指摘してよい（Criticalではない）。
