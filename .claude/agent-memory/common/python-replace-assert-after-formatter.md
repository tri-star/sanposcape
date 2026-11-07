---
name: python-replace-assert-after-formatter
description: スクリプト（python の str.replace・sed）で複数行を置き換えるとき、整形（oxfmt など）で行が折り返されていると黙って当たらない。置き換え前に assert で一致を確かめる
metadata:
  type: feedback
  scope: durable
---

複数ファイルを一度に直すとき、python の `s.replace(old, new)` や `sed` を使うと、`old` が見つからなくてもエラーにならず、何も変わらないまま進む。
直前に整形（`oxfmt`）を走らせていると、1行で書いた式が複数行に折り返されていて、自分が覚えている形と一致しない。
SS-245 で、`combine` の pick 関数に項目を足す置き換えがこれで外れ、型も省略可能だったため typecheck・テストとも通り、再レビューで初めて分かった。

**How to apply:** 置き換えの関数に `assert old in s, path` を入れて、当たらなければ止める（`def rep(p, old, new): s=open(p).read(); assert old in s, p; ...`）。
整形の後に置き換えるときは、先に `sed -n` か Read で今の形を確かめる。置き換えの後は `git diff` で、意図した行が変わったかを見る。
