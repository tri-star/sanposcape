---
name: push-upstream-config-lock
description: git push -u が「could not lock config file .../.git/config: File exists」「unable to write upstream branch configuration」で失敗しても、push 自体は届いている。ls-remote で確かめ、config.lock は消さない
metadata:
  type: feedback
  scope: durable
  source_issue: SS-266
---

worktree から `git push -u origin <branch>` すると、メインの checkout の `.git/config.lock`（中身 0 バイト・読み取り専用。前日から残っていた）のせいで
`error: could not lock config file /home/.../.git/config: File exists` と `unable to write upstream branch configuration` が出て、終了コードも非ゼロになる。
失敗するのは追跡ブランチの設定（`branch.<name>.merge` の書き込み）だけで、リモートへの push は終わっている。

**Why:** エラーを見て push し直したり、`config.lock` を消したりしかけた。`config.lock` は別の worktree のセッションが git の設定を書いている途中の可能性もあり、
消すと相手の書き込みを壊しうる。

**How to apply:**
- `git ls-remote origin <branch>` で、リモートの先頭が手元の `git rev-parse HEAD` と同じかを確かめる。同じなら push は済んでいる。
- 追跡の設定は無くても `gh pr create --head <branch>` は動くので、そのまま PR を作る。`config.lock` は消さない（ユーザーに任せる）。
- push の認証の回避（`-c credential.helper=!gh auth git-credential`。sandbox の外）とは別の問題。[[sandbox-placeholder-untracked-files]] の /dev/null の被せものとも別（こちらは実在する 0 バイトのファイル）。
