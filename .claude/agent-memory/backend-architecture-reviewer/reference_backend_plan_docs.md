---
name: reference_backend_plan_docs
description: backendタスクの実装プラン（設計意図・決定事項・既存調査結果）がどこにあるか
metadata:
  type: reference
---

backend タスクの実装プラン（`backend-workflow` スキルが生成）は `tmp/SS-<課題ID>/backend-plan.md` に置かれる（リポジトリルート相対）。

内容には設計意図、既存コード調査結果、`D1, D2, ...` 形式の決定事項テーブル、スコープ外事項、レビュー観点の伏線が含まれる。

**How to apply:** backend PR をレビューする際は、対象タスクIDが分かれば先に `tmp/SS-<ID>/backend-plan.md` を読むこと。スコープ外と明記されている項目（例: 集計API、削除API等）を「抜け漏れ」として指摘しないよう、必ず先に確認する。ただし `tmp/` は一時領域なので、レビュー時点でファイルが残っているとは限らない（消えていたら通常のコード調査に切り替える）。
