---
name: frontend-development
description: React Webの計画・実装・検証を行う。ページ、コンポーネント、状態管理、API連携、アクセシビリティ変更が対象。
---

# React Web 開発

メインが担当する。既存の `packages/frontend` があればAGENTS.md、設計文書、package.json、類似実装からルーティング・スタイル・状態管理・検証方法を確認する。

このチェックアウトには現在frontendアプリがない。新規依頼ではその事実を計画に明記し、要求と既存APIから構成を決める。[frontendテンプレート](../launch-project/assets/initial-contents/packages/frontend/) は初期案であり、未作成のファイルや未導入ライブラリを既存規約と扱わない。

計画にはユーザー操作、画面遷移、loading/empty/error/success、API契約、認証境界を含める。UI状態とサーバー状態の所有者、キーボード操作、フォーカス、非同期競合を確認する。API変更は [backend-development](../backend-development/SKILL.md) と契約を揃える。

実在するpackage scriptsで型・lint・関連テストを実行する。画面変更はブラウザでも検証する。Orca内なら利用可能な `orca-cli`、それ以外なら利用可能なブラウザ検証手段を使う。未実施の画面確認は明示する。

全体進行は [task-workflow](../task-workflow/SKILL.md)、実装後は [change-review](../change-review/SKILL.md)。
