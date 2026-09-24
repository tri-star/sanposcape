---
name: task-triage
description: 課題の依存関係・進捗・優先度から次に着手するタスクを選ぶ。調査だけなら状態を更新しない。
---

# 次の課題を選ぶ

[issue-tracker](../issue-tracker/SKILL.md) でプロジェクトを特定し、進行中・レビュー待ち・未着手の課題と関連PRを取得する。

依存関係、明示された着手順/延期、進行中の阻害要因、優先度、マイルストーンを照合して候補を提示する。レビュー待ちはPRの現状を確認するが、推薦だけの依頼では課題を更新しない。

ユーザーが実行まで依頼した場合は選んだ課題を [task-workflow](../task-workflow/SKILL.md) または [task-breakdown](../task-breakdown/SKILL.md) で進める。既存記憶のIDは候補として使い、現在のサービスで確認する。
