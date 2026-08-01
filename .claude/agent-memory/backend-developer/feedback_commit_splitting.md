---
name: feedback-commit-splitting
description: 複数のレビュー指摘が同じファイルに対する修正になる場合、1指摘=1コミットに分割する具体的な手順
metadata:
  type: feedback
---

このプロジェクトの git commit ガイドライン（`docs/git-commit-guideline.md`）は「1ステップ完了ごとに
関連ファイルだけをコミットする」ことを求めている。レビュー対応など複数の独立した指摘に同時に着手すると、
同じファイル（例: `walks/tests/test_router.py`）に複数指摘分の変更が積み上がりがちだが、それでも
指摘単位でコミットを分けるべき。

**Why:** コミットを見ることで「この作業でどのファイルがどのように変更されたか」を追えるようにする
ため（ガイドライン本文の意図）。1コミットに複数の独立した指摘対応を混ぜると、後から特定の指摘だけを
revert/cherry-pick したい場合に困る。

**How to apply**: 変更がファイル内で非連続なブロック（＝別々の diff hunk）に分かれている場合、
`git reset <file>` で一旦アンステージしてから `printf 'n\ny\n' | git add -p <file>` のように
yes/no を標準入力で流し込んで hunk 単位でステージを選別できる（対話プロンプトが使えない環境でも
機能する）。`git diff --cached <file> | grep '^+'` でステージ内容を確認してから commit する。

一方、`router.py` の本体変更（例: `AwareDatetime` 化）とそれに対応する回帰テストは同じ指摘に属するため
1コミットにまとめてよい。「指摘（レビュー項目）単位」で分けるのが基準であり、「ファイル単位」ではない。
