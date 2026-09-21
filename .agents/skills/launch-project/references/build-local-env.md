# 開発基盤

対象packageの要求と現行の公式資料を確認し、依存管理、lint/format、関連テスト、CI、ローカル起動を整える。既存のpackage規約を優先する。

backendはDockerでFastAPIとDBを起動し、移行とOpenAPI生成を確認する。クライアントは生成APIと整合させる。React Webはブラウザ確認、Expoはdevelopment buildと必要な端末確認を行う。

.envは [local-env-setup](../../local-env-setup/SKILL.md) で作成する。既存データや設定を初期テンプレートで上書きしない。
