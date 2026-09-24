---
name: task-status-sync
description: 着手・レビュー対応・PR作成・マージ確認に応じて課題状態を同期する。既存の呼び出し名を維持する入口。
---

# 課題状態の同期

[issue-tracker](../issue-tracker/SKILL.md) を読み、メインが課題ID、イベント（start / review-fix / pr-created / pr-merged）、必要なPR URLを渡して操作する。状態の解決・重複防止・マージ確認はそのskillの規則に従う。操作専用Subagentは起動しない。

課題やPRが会話から特定できれば再質問しない。複数候補で対象が確定できない場合だけ確認する。計画だけの依頼からは更新を呼び出さない。
