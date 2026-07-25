# ローカル開発ガイド

## コマンド実行の注意事項

`alembic`、`ruff`、`pytest` などのコマンドは、**必ず Docker コンテナ内で実行する**。

ホストから直接 `uv run alembic ...` などを実行してはいけない。`.venv` は Docker コンテナ用に構築されているため、ホストからは権限エラーや依存関係の不一致が発生する。

`docker compose exec api ...` を含む backend のコマンドは、非rootの `app_user` として実行される。WSL2 で bind mount に生成物を書き込む場合は、[ローカル環境構築手順](./local-env.md#wsl2-の-uidgid-を合わせる) に従って `APP_UID` / `APP_GID` をホストの `id -u` / `id -g` に合わせる。

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

### 権限エラーの確認

`permission denied` が出た場合は、コンテナ内のユーザーと設定値を確認する。

```bash
docker compose exec api id
docker compose exec api sh -c 'test -w /app && test -w /app/.venv'
```

UID/GID を変更している場合は、`docker compose up -d --build` でイメージを再作成し、必要なら `local-env.md` の手順で `venv-app-user` volume だけを再作成する。DB volume を削除しない。
