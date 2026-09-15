---
name: git-worktree
description: Orca管理外のGit worktreeを既存のパス制約に従って作成・削除・VS Codeで開く。
---

# Git worktree

Orca管理下なら利用可能なorca-cliを優先する。このskillのスクリプトは `/home/*/projects/*.worktrees/*` のパスだけを対象とし、別の管理ルートに流用しない。

```bash
bash .agents/skills/git-worktree/scripts/create-worktree.sh --branch <name> --base <ref>
bash .agents/skills/git-worktree/scripts/open-worktree-vscode.sh <正確なworktreeパス>
bash .agents/skills/git-worktree/scripts/remove-worktree.sh <正確なworktreeパス>
```

削除前にworktree一覧・対象パス・変更・未pushコミットを確認する。既存スクリプトはforce削除を行うため、未保存/未pushの作業がある場合は実行せず、保存または削除対象の承認を得る。広い親ディレクトリを削除しない。初期化が必要ならlocal-env-setupを使う。

skillのメタデータで独立したコンテキストやSubagent起動を保証することはしない。
