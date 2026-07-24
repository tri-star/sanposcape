# ローカル開発ガイド

## コマンド実行の注意事項

`alembic`、`ruff`、`pytest` などのコマンドは、**必ず Docker コンテナ内で実行する**。

ホストから直接 `uv run alembic ...` などを実行してはいけない。`.venv` は Docker コンテナ用に構築されているため、ホストからは権限エラーや依存関係の不一致が発生する。

### 正しい実行方法

```bash
# packages/backend ディレクトリに移動してから実行
cd packages/backend

# Alembic マイグレーション生成
docker compose exec api uv run alembic revision --autogenerate -m "<message>"

# Alembic マイグレーション適用
docker compose exec api uv run alembic upgrade head

# Lint チェック
docker compose exec api uv run ruff check

# Format チェック
docker compose exec api uv run ruff format --check

# テスト実行
docker compose exec api uv run pytest
```

### コンテナが起動していない場合

```bash
cd packages/backend
docker compose up -d
```

コンテナが healthy になるまで待ってからコマンドを実行する。
