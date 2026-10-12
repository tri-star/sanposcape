---
name: verification-revert-without-git-checkout
description: 修正が効いているかを確かめるために一時的にソースを壊した後、git checkout -- で戻すと未コミットの修正ごと消える。手で戻すか、壊す前に WIP コミットする
metadata:
  type: feedback
  scope: durable
---

レビュー対応で書いた修正が本当に効いているかを確かめるため、一時的にソースを元の（バグのある）状態に書き換えてテストが red になることを
確認してから戻す、という手順を踏むことがある。この「戻す」に `git checkout -- <file>` を使うと、まだ commit していないファイルは HEAD
（＝修正前）に巻き戻り、自分が書いた修正そのものが消える。

**Why:** `git checkout -- <path>` はワーキングツリーをインデックス（未ステージなら HEAD）に戻すコマンドで、「直前の編集を取り消す」コマンドではない。

**How to apply:**
- 壊す → 検証 → 戻す、のサイクルでは、壊した箇所だけを手で逆方向に置換して戻す（Edit ツールで）。
- git で戻したいなら、壊す前に WIP コミットを作ってから壊し、検証後に `git diff` で差分を確かめてから `git reset` する。
  `git stash` は使わない（他のセッション・worktree と stash のスタックを共有しているため）。
- サイクルの後は `git status --short` で、対象ファイルが意図した差分に戻っているかを確かめてから次へ進む。
