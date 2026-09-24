---
name: reference-remote-branch-access
description: How to read files from unmerged/closed branches (e.g. a prior attempt's PR) when the planner has no Bash/git — GitHub repo is public
metadata:
  type: reference
  scope: durable
---

mobile-planner には Bash が無く `git show origin/<branch>:<path>` を実行できない。worktree の `.git` はファイルで、オブジェクトは圧縮されているので Read でも読めない。

代わりに、リポジトリ `tri-star/sanposcape` は GitHub で公開されているので WebFetch で読める（2026-09 / SS-33 で確認）。
- ブランチ上のファイル: `https://raw.githubusercontent.com/tri-star/sanposcape/<branch>/<path>`（例: ブランチ名 `tri-star/SS-33` はスラッシュのままでよい）
- PR の変更ファイル一覧: `https://github.com/tri-star/sanposcape/pull/<n>/files`

**How to apply:** オーケストレーターから「前回試行のブランチを参考に」と言われたら、上の方法で読む。WebFetch は小さなモデルが要約するので、スキーマやトークン値のように正確さが要るものは「verbatim で返して」と指示する。長いファイルは要約されて細部が落ちる。

Related: [[reference-planning-inputs]]
