---
name: task-workflow
description: 課題ID・URL・本文から開発を進める。計画のみ、実装、既存計画の再開に対応し、backend・React・mobileを横断する。
---

# 課題から開発する

メインが要件・計画・実装・検証を担当する。ユーザー指定の範囲を優先し、計画のみなら実装・課題更新・PR作成へ進まない。

1. 課題ID/URLなら [issue-tracker](../issue-tracker/SKILL.md) で本文・受け入れ条件・関連課題・必要なコメントを取得し、取得完了後に計画する。本文が直接渡された場合はその本文で進め、未取得の外部情報を推測しない。
2. 作業ツリーと対象packageを確認する。既存変更は保持する。Orca管理下のworktree操作が必要なら利用可能な `orca-cli` に従う。ディレクトリ名だけで課題・ブランチを変更しない。
3. 関係する領域だけ読む: [backend](../backend-development/SKILL.md)、[React](../frontend-development/SKILL.md)、[mobile](../mobile-development/SKILL.md)。インフラ・CIは対象構成と既存ADRをメインで調べる。
4. 受け入れ条件、変更ファイル、API/データ契約、実装順、必要な検証を計画する。複数領域では共通API契約を先に決め、backendスキーマ → OpenAPI生成 → Orval生成 → クライアント実装の依存順を守る。API変更のない画面は独立して進めてよい。
5. 実装依頼では実際の着手時に課題の `start` を反映する。メインで実装し、関連テストと必須チェックを実施する。`.env` 不在に気づいたら [local-env-setup](../local-env-setup/SKILL.md)。
6. [change-review](../change-review/SKILL.md) で独立レビューと文書乖離を確認する。範囲内の確かな不具合は修正し、関連する検証を実施する。仕様選択が必要なら選択肢と影響を提示する。
7. コミット規約に従う。push・PR作成が依頼範囲に含まれる場合は実行し、成功を確認して `pr-created` を反映する。ローカル実装だけならその完了を報告し、PR作成済みや課題完了と扱わない。

## 記録と再開

計画・レビュー・申し送りは `tmp/<issue-id>/`（IDなしなら `tmp/<YYYYmmdd-HHMM>/`）。IDはパス区切りや `..` を含まない安全な名前にする。小変更に複数の記録を強制しない。複雑な課題は `plan.md` に領域別の節を作り、`handover-notes.md` に決定・未完了・検証結果・外部更新の成否を残す。

再開時は対象課題の記録と現状を照合する。重要な設計判断は [adr-writing](../adr-writing/SKILL.md)。永続文書から一時メモへリンクしない。レビュー修正の再着手は `review-fix`、マージによる完了は対象PRの実際のマージ確認後だけ反映する。
