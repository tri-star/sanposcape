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
- AWS SDK: boto3。Secrets Manager（`integrations/aws/secrets.py`, SS-67）、AWS AppConfig（`integrations/aws/appconfig.py`, SS-98）、S3（`integrations/aws/s3.py`, SS-88）の取得層で使用。Lambda の python3.12 管理ランタイムに同梱されるため zip には含めず、`[dependency-groups] dev` にのみ追加（ユニットテスト・型解決用）
- 画像処理: Pillow（`pins/thumbnails.py`, SS-88）。ピン写真のサムネイル生成（デコード検証・EXIF回転補正・リサイズ・再エンコード）に使用。boto3 と異なりランタイム同梱ではないため `pyproject.toml` の `dependencies`（本体）に追加し、Lambda の zip に含める（`sam build --use-container` で manylinux wheel が入ることを BK-1 で確認する）
- multipart フォーム解析: `python-multipart`。`STORAGE_MODE=fake` 用の `/dev-storage/uploads`（`pins/dev_storage_router.py`）が FastAPI の `Form`/`File` を使うため必要（本番では S3 へ直接アップロードするため経路自体が存在しないが、依存としては zip に含める）

## 環境

- Docker Composeを利用してAPIサーバー、DB(PostgreSQL)コンテナを作成、
  Python, DB関連のコマンドは全てdocker compose exec を通して実行する方式
- コンテナ外に公開するポートは.envで簡単に差し替えられるように以下のように環境変数で上書き可能な形で宣言

```yaml
ports:
  - "${API_CONTAINER_PORT:-8000}:8000"
```
