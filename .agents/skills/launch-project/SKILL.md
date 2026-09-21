---
name: launch-project
description: 新しいプロジェクトやクライアントを初期化し、ローカル環境・CI・実装と検証の基盤を整える。
---

# プロジェクトを開始する

ユーザー要求と既存構成からbackend、Web、mobileの対象を決める。既存のプロジェクトへ初期テンプレートを上書きしない。計画・実装はメインで行う。

[概要テンプレート](templates/project-overview.md) と [概要の検討](references/project-overview.md) を必要に応じて使い、重要な未決定事項を解決する。backendはFastAPI/SQLAlchemy、Webは要求に合うReact構成、mobileはExpoと既存の開発方針を基準に検討する。mobileをViteやExpo Go前提で初期化しない。

フォルダ構造・命名・技術スタック・デプロイ先を決めてdocsとAGENTS.mdに記録する。初期ファイルは [assets](assets/initial-contents/) を参考に、現行の公式資料と要求に合わせて適応する。テンプレートの古い版・状態管理・ツール名を無条件に採用しない。

ローカル初期化、lint/format、関連テスト、OpenAPI/クライアント生成、CIを整える。.env生成は [local-env-setup](../local-env-setup/SKILL.md)。Webは画面確認、mobileはdevelopment buildと必要な端末確認、backendはDockerで実装と検証が回る状態を確認する。

重要な決定は [adr-writing](../adr-writing/SKILL.md)、完了前は [change-review](../change-review/SKILL.md)。
