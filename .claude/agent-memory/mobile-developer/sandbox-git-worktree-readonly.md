---
name: sandbox-git-worktree-readonly
description: git add/commit が Read-only file system で失敗するsandbox環境の既知の制約
metadata:
  type: project
---

このリポジトリは `<workspace>/.git` がファイルで、実体
（`/home/tristar/projects/sanposcape/.git/worktrees/<branch>/`）を指す git worktree 構成になっている。
この orca sandbox 環境では、実体側のディレクトリが最終的に read-only bind mount
（`mount` で確認すると同一パスに rw→ro の多重マウントが積まれ、最後が ro で確定する）になっており、
`git add` / `git commit` が `Unable to create '.../index.lock': Read-only file system` で
**必ず失敗する**（sandbox policy 上は write allowOnly に含まれているにもかかわらず失敗する。
policy 記載と実際のマウント状態が一致していない模様）。

**再現性**: 複数回リトライしても、時間を置いても解消しなかった（2026-08-16 時点、SS-60 作業時）。
`dangerouslyDisableSandbox` は policy でそもそも無効化されているため回避不可。

**対応**: このタイプの環境に当たった場合、作業（ファイル編集・lint/format/test/typecheck）は
すべて実施した上で、コミットだけはできない旨をユーザー・親エージェントに明示的に報告する。
勝手に diff を諦めたり、無理なワークアラウンド（GIT_DIR 差し替え等。同じマウントの下なので効果なし）
を繰り返して時間を浪費しないこと。
