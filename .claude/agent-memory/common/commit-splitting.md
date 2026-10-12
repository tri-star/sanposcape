---
name: commit-splitting
description: 同じファイルに複数のレビュー指摘の変更が積み上がったとき、指摘単位でコミットを分ける手順（printf で git add -p に答える、隣接して割れない hunk は並べ替えか patch 抽出、最後にバックアップと diff で照合）
metadata:
  type: feedback
  scope: durable
---

`docs/git-commit-guideline.md` のとおり、コミットはレビュー指摘（作業ステップ）単位で分ける。ファイル単位ではないので、同じファイル
（例: `walks/tests/test_router.py`）に複数の指摘分の変更が積み上がっても割る。本体の変更とその回帰テストは同じ指摘なので1コミットでよい。

**Why:** 後から特定の指摘だけを revert / cherry-pick したり、どの指摘でどのファイルがどう変わったかを追えるようにするため。
対話プロンプトが使えない環境なので、`git add -p` をそのままでは使えない。

**How to apply:**
1. 変更が別々の hunk に分かれているなら、`git reset <file>` でアンステージしてから `printf 'n\ny\n' | git add -p <file>` のように
   y/n を標準入力で流し込んで hunk を選ぶ。`git diff --cached <file> | grep '^+'` でステージ内容を確かめてから commit する。
2. 2つの指摘の追加箇所が隣接して1つの hunk になる（`s` は非連続な変更の間にしか効かない）ときは、`git diff -- <file> | grep -n '^@@'` で境界を見て、
   意味を変えずにブロックを並べ替え、既存の行（3行以上）を間に挟んで hunk を分ける。
3. 本質的に絡み合っていて分けられないなら、どちらのコミットに含めるかを決め、コミットメッセージにその旨を書く。
4. まとめて実装した後で遡って割るなら、全体差分を保存し、hunk 単位に切り出した patch（diff ヘッダー4行 + 対象 hunk）を作り、
   ファイルを HEAD に戻してからコミット順に `git apply` を積む。`openapi.yaml` のような生成物は、patch ではなく各コミットの直後に
   `scripts/export_openapi.py` で作り直す。
5. 作業前に最終版のファイル一式を一時ディレクトリへ退避し、全コミットの後で working tree とバイト単位で一致するか `diff` で確かめる。
