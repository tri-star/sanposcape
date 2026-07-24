## ツール・ライブラリ

- 開発言語: Python
- パッケージ管理: uv
- フレームワーク: Fast API
- ORM: SQLAlchemy + alembic
- ユニットテスト: pytest
- Lint, Formatter: ruff
- スキーマ管理: Pydantic
- 認証: Auth0。 authlib
- OpenAPI定義生成: Fast APIの機能を利用

## 環境

- Docker Composeを利用してAPIサーバー、DB(PostgreSQL)コンテナを作成、
  Python, DB関連のコマンドは全てdocker compose exec を通して実行する方式
- コンテナ外に公開するポートは.envで簡単に差し替えられるように以下のように環境変数で上書き可能な形で宣言

```yaml
ports:
  - "${API_CONTAINER_PORT:-8000}:8000"
```
