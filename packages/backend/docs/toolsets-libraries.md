## ツール・ライブラリ

- 開発言語: Python
- パッケージ管理: uv
- フレームワーク: Fast API
- ORM: SQLAlchemy + alembic
- ユニットテスト: pytest
- Lint, Formatter: ruff
- スキーマ管理: Pydantic
- 認証: Google Sign-In（モバイルが public client として Google と直接対話）+ backend 自前セッショントークン。ID token 検証・自前 JWT 発行ともに `pyjwt[crypto]` を使用（詳細は [ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)）
- OpenAPI定義生成: Fast APIの機能を利用
- AWS SDK: boto3。Secrets Manager（`integrations/aws/secrets.py`, SS-67）と AWS AppConfig（`integrations/aws/appconfig.py`, SS-98）の取得層で使用。Lambda の python3.12 管理ランタイムに同梱されるため zip には含めず、`[dependency-groups] dev` にのみ追加（ユニットテスト・型解決用）

## 環境

- Docker Composeを利用してAPIサーバー、DB(PostgreSQL)コンテナを作成、
  Python, DB関連のコマンドは全てdocker compose exec を通して実行する方式
- コンテナ外に公開するポートは.envで簡単に差し替えられるように以下のように環境変数で上書き可能な形で宣言

```yaml
ports:
  - "${API_CONTAINER_PORT:-8000}:8000"
```
