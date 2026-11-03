---
name: git-ls-files-needs-z-for-non-ascii
description: スクリプトで git ls-files の出力を行で読むと、日本語などの非 ASCII のパスが "\346\227..." と引用符つきで出て、実在のパスと一致せず黙って落ちる。-z で NUL 区切りにして読む
metadata:
  type: feedback
  scope: durable
  source_issue: SS-252
---

`git ls-files`（`git diff --name-only` なども同じ）は、`core.quotepath` が既定の true のとき、非 ASCII を含むパスを
`"packages/lp/src/\346\227\245\346\234\254.astro"` のように引用符と8進のエスケープで出す。
Python などで `stdout.splitlines()` して `Path` に渡すと、そのパスは存在しないものとして扱われ、例外も出ずに検査の対象から消える。

**Why:** SS-252 の `scripts/code-health/check-structure.py` で、レビューの指摘（日本語名のファイルが行数の検査から漏れる）で気づいた。
リポジトリには日本語名のファイルが今は少なく、手元の実行では差が出ないので見落としやすい。
SS-252 の時点で `scripts/knowledge/check-doc-references.py`・`check-memory-staleness.py` は `-z` なしで呼んでいる（未対応）。

**How to apply:**
- スクリプトから呼ぶときは `git ls-files -z ...` にして `stdout.split("\0")` で読み、空の要素を捨てる。
- テストでは一時リポジトリに日本語名のファイルを置いて、対象に入ることを確かめる（`scripts/code-health/tests/test_check_structure.py` の MainTest が例）。
- `-c core.quotepath=false` でも引用符は外れるが、改行を含むパスまで安全に扱えるのは `-z`。
