---
name: worktree-outside-orca-gets-removed
description: Orca の管理外に作った worktree が作業中に消えた（原因不明。未コミットの変更ごと）。worktree は Orca で作り、区切りごとにすぐコミットする。既存ブランチで Orca の worktree を作るには、ブランチを一時的に改名して base にする
metadata:
  type: feedback
  scope: durable
  source_issue: SS-230
---

SS-230 で `git worktree add` で `/home/tristar/projects/sanposcape.worktrees/ss-230` を作ったところ、作業の途中で
ディレクトリの中身と `git worktree list` の登録ごと消え、未コミットの文書の変更と作業メモ（プラン・判断の記録）を失った。誰が消したかは分からない
（ブランチとコミットは残っていた）。既存の worktree はすべて Orca 配下（`/home/tristar/orca/workspaces/sanposcape/`）にあった。

**Why:** 管理外の worktree は、別のセッションや Orca の後片付けで消される可能性がある。コミットしていない変更は戻せない。

**How to apply:**
- worktree は `orca-ide worktree create --repo id:<repoId> --name <name> --no-parent --setup skip --json` で Orca 配下に作る
  （sandbox 外。`orca-ide repo list --json` で sanposcape の repo id を引く）。
- `worktree create` は新しいブランチしか作れない（名前は `tri-star/<name>`）。既存ブランチを使うときは、ブランチを
  `<branch>-base` に改名し、`--base-branch <branch>-base` で作ってから、SHA が同じことを確かめて改名した方を `branch -D` で消す。
- 区切りごとにすぐコミットする。作業メモは git の管理外なので、消えて困る判断は早めに ADR・PR 本文へ移す。
- Orca 配下・管理外を問わず、メインのチェックアウトの外の worktree は sandbox から書き込めない（EROFS）。そこでのコマンドは sandbox 外で実行する。

Related: [[sandbox-placeholder-untracked-files]]
