---
name: dependabot-update-workflow
description: DependabotのPRについて更新内容を説明するか、互換性の修正・検証・追加pushを行う。
---

# Dependabot 更新

メインが `gh auth status` と対象PRのauthor、head/base、変更ファイル、差分を確認する。Dependabot以外ならその事実を示し、依頼対象が正しいか判断する。

explainは更新パッケージ・前後version・破壊的変更・このプロジェクトで必要な作業を調べて回答する。説明だけなら外部コメントを投稿しない。

resolveは既存変更とworktreeの所有を確認して対象ブランチで修正する。Orca管理下の操作は利用可能なorca-cliに従う。変更ファイルからbackend/mobile/frontend/GitHub Actionsを判定し、対象領域のdevelopment skillと正本に従って互換性修正・関連検証を実施する。旧detect-ecosystem.shはnpm変更をfrontend扱いするため領域判定に使わない。

[change-review](../change-review/SKILL.md) で確認し、修正した場合はコミット・対象PRブランチへのpushまで進める。不要なら空コミットを作らない。既存レビューへの対応は [summarize-pr-comments](../summarize-pr-comments/SKILL.md)。

PRコメントも依頼されている場合は、内容を本文ファイルに用意して `bash .agents/skills/dependabot-update-workflow/scripts/post-or-update-pr-comment.sh <PR番号> "<marker>" <本文ファイル>` で重複を避けて投稿できる。成功・未反映・未確認を区別して報告する。
