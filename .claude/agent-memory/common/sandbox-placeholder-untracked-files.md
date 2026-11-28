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
- repo 直下の `.env` も被せ物なので、sandbox 内の `ls .env` が通っても `.env` があるとは限らない（SS-286 で `docker compose --env-file .env` が外で「couldn't find env file」）。
  セットアップ済みかは `packages/backend/.env`・`packages/mobile/.env` で確かめ、無ければ `local-env-setup` skill を使う。
- 見慣れない追跡外ファイルは、まず `ls -la` で文字デバイス（1, 3）かを確かめる。そうなら無視してよい。
- `git status` を sandbox の外で見るために sandbox を外すことはしない（commit まで外に出すと、リポジトリのフックが sandbox なしで動く）。
- 作業ディレクトリを repo の下のフォルダに移した（`cd`）後、そこに空の `.claude/.cc-writes/`（中身なし・追跡外）ができることがある（SS-260）。
  `git mv` でフォルダを空にしたときは、旧フォルダに残ったこれが空ディレクトリの削除を邪魔するので、`find <旧フォルダ> -depth -type d -empty -delete` で消す。
  移動先のフォルダにできた分も、作業の最後に消す。
- 隠したい場合の候補は `.git/info/exclude`（コミットされず、全 worktree に効く）。`.claude/` の下まで隠すと、そこに置いた新しいファイルも `git status` に出なくなる。
