---
name: git-worktree
description: Create, delete, and open git worktrees safely under /home/*/projects/*.worktrees/*. Use when you want an isolated checkout for a branch, want to remove a worktree safely, or want to open a worktree in VS Code.
context: fork
allowed-tools: Bash, Read
---

# Git Worktree

`git worktree` を「作成・削除・VS Codeで開く」ためのスキルです。安全のため、このスキルが提供するスクリプトは worktree パスが次の形式に一致する場合のみ操作します。

- glob: `/home/*/projects/*.worktrees/*`
- 判定は正規表現で実施（`..` などのディレクトリトラバーサル対策として `realpath` で正規化してからチェック）

## できること

1. worktreeを作成し、作成したフォルダパスを出力する
2. 指定したworktreeを安全に削除する（パスの形式チェック後に `git worktree remove`）
3. 指定したworktreeを VS Code で開く（パスの形式チェック後に `code <path>`）

## 使い方

### 1) worktree作成

- 必須: `--branch <name>`
- 任意: `--base <ref>`（デフォルト `HEAD`）

```bash
bash .claude/skills/git-worktree/scripts/create-worktree.sh --branch feature-foo
```

ベースを指定する例:

```bash
bash .claude/skills/git-worktree/scripts/create-worktree.sh --branch feature-foo --base origin/main
```

### 2) worktree削除（安全チェック付き）

```bash
bash .claude/skills/git-worktree/scripts/remove-worktree.sh /home/<user>/projects/<repo>.worktrees/<name>
```

### 3) worktreeをVS Codeで開く（安全チェック付き）

```bash
bash .claude/skills/git-worktree/scripts/open-worktree-vscode.sh /home/<user>/projects/<repo>.worktrees/<name>
```

## 実装方針（重要）

- 削除・VS Codeで開くは「パスを正規化 → 正規表現で許可パスだけ通す → 実行」の順序。
- `rm -rf` は基本的に使わず、`git worktree remove --force` を優先。
- `code` コマンドがない場合はエラーにして終了。

## 補足

- `context: fork` を指定し、このスキルは独立したコンテキストで実行されます（会話を汚しにくい）。
