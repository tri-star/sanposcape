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

## 実 S3 に繋いで確認する（STORAGE_MODE=real）

平常のローカル開発は `STORAGE_MODE=fake`（backend 自身の `/dev-storage/*`）で足りる。
ただし**写真の直送は端末 → S3 で完結して backend を通らない**ため、直送まわりの不具合は
fake では再現しないことがある（SS-88 の実機不具合が実例。
[ADR-M-010 の追補](../../mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md)）。
そのときだけ、ローカルの backend を dev の実バケットに向ける。

`packages/backend/.env` を次のように変える（3行）。

```
STORAGE_MODE=real
PIN_PHOTO_BUCKET_NAME=sanposcape-dev-pin-photos-<account_id>
PIN_PHOTO_BUCKET_REGION=ap-southeast-1
```

`ENV=local` のままでよい（`local` + `real` は起動バリデーションを通る）。
`DEV_STORAGE_DIR` は fake 専用なので残しておいて無害。

**AWS の認証情報は `.env` に書かない**（一時認証情報は短命で必ず古くなる）。シェルから渡す:

```bash
eval "$(aws configure export-credentials --profile sanposcape-dev --format env)"
docker compose --project-directory packages/backend -f packages/backend/compose.yaml \
  up -d --force-recreate api
```

`compose.yaml` が `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` を
透過させる（既定は空）。`AWS_REGION` だけは既定値 `ap-southeast-1` を持つ。

なお `UnconfiguredObjectStorage`（写真 API が 503）に落ちる条件は AWS の認証情報ではなく
**`PIN_PHOTO_BUCKET_NAME` が空であること**（`integrations/aws/s3.py` の
`build_object_storage()`）。
バケット名を設定したのに認証情報を渡し忘れた場合は、503 ではなく S3 呼び出しの失敗
（`S3 operation failed` のログ + 503）になる。

確認できること・できないこと:

- ✅ presigned POST の発行と、端末からの直送が実 S3 で通るか
- ✅ 確定処理（HEAD/GET → サムネイル生成 → Copy → `staging/` 削除）
- ❌ **Lambda 実行ロールの権限**。署名者はローカルの AWS プロファイル（通常は管理者権限）になるため、
  IAM の付与漏れ・境界（SS-107）の不足はこの方法では再現しない
  （[deployment.md](./deployment.md) §12 の「初回デプロイで確認すること」3) で静的に確認する）

`staging/` のオブジェクトは S3 のライフサイクルで1日後に消える。すぐ消したい場合は
`aws s3 rm` で個別に削除する。確認が終わったら `.env` を `STORAGE_MODE=fake` に戻し、
api コンテナを作り直すこと（コンテナは作成時の環境変数を保持する）。

## ログの形式（`LOG_FORMAT`。ADR-013 / SS-180）

ログの形式は `LOG_FORMAT` で選ぶ。

| 値 | 内容 |
|---|---|
| `console`（compose の既定） | 読みやすい 1 行表記。文脈があれば末尾に `[http_method=… http_route=… user_id=… trace_id=…]`（JSON と同じキー名・順。値が無いものは出ない）。例外は標準のトレースバック（メッセージ込み） |
| `json` | Lambda / 将来の ECS と同じ 1 レコード 1 行の JSON。`timestamp` / `level` / `logger` / `message` と、`trace_id` / `span_id`（`TRACING_ENABLED=true` のとき）・`http_method` / `http_route`・`user_id`（認証済み）など |

JSON の見え方を確かめたいときは、`.env` に `LOG_FORMAT=json` を足す（または
`LOG_FORMAT=json docker compose up -d --force-recreate api`）。コンテナは作成時の環境変数を
保持するので、変えたら作り直す。`TRACING_ENABLED=true` + Jaeger と組み合わせると、ログの `trace_id` で
Jaeger のトレースを引ける。JSON は `docker compose logs --no-log-prefix api | jq -R 'fromjson? // empty'` で整形できる
（uvicorn 自身の起動・アクセスログの行はテキストのまま混ざるため、`fromjson?` で JSON でない行を読み飛ばす。
`-R` を付けないと jq がテキスト行で止まる）。
`console` は `ENV=local` / `test` のときだけ許可される。ログの項目・Logs Insights のクエリは
[deployment.md](./deployment.md) §15。

## トレースをローカルで確認する（Jaeger。ADR-013 / SS-178）

API のリクエストを OpenTelemetry でトレースし、「どの部分（DB・外部 API・S3 など）で時間が
掛かっているか」をローカルで見る。既定は無効（`TRACING_ENABLED=false`）で、無効のときは
OpenTelemetry を import すらしない。

### 起動

```bash
cd packages/backend
# 1. ビューア（Jaeger v2）を起動。profile `observability` を付けたときだけ起動する
docker compose --profile observability up -d jaeger
# 2. .env に TRACING_ENABLED=true を足す（.env.example にコメント付きの行がある）
# 3. api を作り直す（コンテナは作成時の環境変数を保持するため restart では反映されない）
docker compose up -d --force-recreate api
```

`TRACING_ENABLED=true` のとき、`scripts/start-api.sh` が `opentelemetry-instrument uvicorn ...`
で api を起動する（TracerProvider とエクスポーターはこの起動ラッパーが構成する。アプリは構成しない）。

### 確認

http://localhost:16686（`JAEGER_UI_PORT` で変更可。ポートは `127.0.0.1` にだけ公開する）を開き、サービス `sanposcape-backend-api` を選ぶ。

- スパン名は `GET /pins/{pin_id}` のようにルートのテンプレート単位。`/health` は出ない
- DB（SQLAlchemy）・Google（httpx）・S3 / AppConfig（botocore）・JWKS 取得（urllib。`AUTH_MODE=real` の
  サインイン時のみ）が子スパンとして付く。子スパンは、その処理が実際に走ったときだけ出る
  （例: DB のスパンは DB を使うルート、Google のスパンは `MAPS_MODE=real`、S3 のスパンは
  `STORAGE_MODE=real` のとき。`fake` はネットワークに出ないのでスパンが出ない）周回ルートの並列取得（`ThreadPoolExecutor`）の子スパンも
  同じトレースに入る
- クエリ文字列・ヘッダー・ボディ・SQL のバインド値は属性に載せない（ADR-013 決定6）

### 戻し方

`TRACING_ENABLED=false`（または行を消す）にして `docker compose up -d --force-recreate api`。
Jaeger は `docker compose --profile observability stop jaeger`（履歴はメモリ内なので停止で消える）。

### 注意

- jaeger を起動せずに `TRACING_ENABLED=true` にすると、エクスポーターの接続エラーがログに出る
  （API の動作には影響しない）。
- Lambda との違い: ローカルは ADOT ではなく upstream の `opentelemetry-distro` + OTLP/HTTP で送る。
  Application Signals 用の属性は付かない。Lambda では ADOT レイヤーが TracerProvider を構成する
  （[deployment.md](./deployment.md)「トレース」）。
- pytest はこの設定に依存しない（`conftest.py` が `TRACING_ENABLED` を環境変数から外し、
  テストは自前の `TracerProvider` を使う）。
