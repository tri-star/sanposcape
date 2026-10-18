---
name: sandbox-placeholder-untracked-files
description: sandbox 内の git status に .bashrc・.gitconfig・.env・.claude/hooks などの追跡外ファイルが出るのは、sandbox が拒否パスに被せた /dev/null（文字デバイス 1,3）。中身は無く、add しない。add はパスを名指しする
metadata:
  type: feedback
  scope: durable
  source_issue: SS-217
---

sandbox（Claude Code の bubblewrap）の中で `git status` を見ると、repo 直下の `.bashrc` `.bash_profile` `.gitconfig` `.env`、
`.claude/commands` `.claude/hooks` `.claude/launch.json` `.claude/loop.md` などが「追跡外」として出ることがある。
`ls -la` すると `crw-rw-rw- 1 nobody nogroup 1, 3` で、sandbox が読み書きを拒否するパスに `/dev/null` を被せたもの。
sandbox の外からは見えない。読もうとすると Permission denied になる（`grep -r` の警告にも出る）。

**Why:** 実ファイルと誤解して add したり、「見知らぬファイルがある」と作業を止めたりしやすい（SS-217 で `git reset --hard` の後に気づいた）。

**How to apply:**
- `git add -A` / `git add .` は使わず、変更したパスを名指しして add する。
- 見慣れない追跡外ファイルは、まず `ls -la` で文字デバイス（1, 3）かを確かめる。そうなら無視してよい。
- `git status` を sandbox の外で見るために sandbox を外すことはしない（commit まで外に出すと、リポジトリのフックが sandbox なしで動く）。
- 隠したい場合の候補は `.git/info/exclude`（コミットされず、全 worktree に効く）。`.claude/` の下まで隠すと、そこに置いた新しいファイルも `git status` に出なくなる。
