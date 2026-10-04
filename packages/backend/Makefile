# SAM `BuildMethod: makefile` 用のビルドスクリプト（packages/backend/ 直下）。
#
# `sam build --use-container` は各 AWS::Serverless::Function の論理IDごとに
# `make build-<論理ID>` を呼ぶ。本プロジェクトは src レイアウト + uv 依存管理のため、
# SAM 標準の python-pip ワークフロー（CodeUri 直下の requirements.txt 前提）ではハンドラの
# モジュールパスが解決できない。ここで成果物を明示的に組み立てる
# （詳細: docs/deployment.md）。
#
# 事前準備: `make lambda-requirements` を `sam build` より前に1回実行しておくこと。
# ビルドコンテナ（public.ecr.aws/sam/build-python3.12）には uv が無いため、
# requirements-lambda.txt の生成だけはコンテナ外（ホスト or api コンテナ）で行う。
# 生成物は .gitignore 対象（環境ごとに再生成する前提のため commit しない）。
#
# ★ .env はここでコピーしない。`Settings` は `env_file=".env"` を見ており、Lambda の CWD は
#   `/var/task` のため .env が混入すると意図しない値が読まれてしまう（本番でだけ再現しにくい
#   事故になる）。下のとおり対象を明示列挙することで構造的に混入を防いでいる
#   （`cp -r . "$(ARTIFACTS_DIR)"` のような丸ごとコピーは絶対にしないこと）。

# ★ 成果物に `opentelemetry*` を入れてはいけない（ADR-013 決定1 / SS-178）。
#   OpenTelemetry は ADOT レイヤー（template.yaml の `Layers`）が提供する。Lambda の sys.path では
#   /var/task（この成果物）が /opt/python（レイヤー）より前に来るため、zip に入れると
#   レイヤーの SDK と版が混ざる。pyproject.toml では dev グループに置いて
#   `uv export --no-dev` で除いている。build-Api の末尾のガードは、誰かが dev から
#   dependencies に移したときに気付くためのもの。

.PHONY: lambda-requirements build-Api build-Migrate

lambda-requirements:
	uv export --frozen --no-dev --no-emit-project --format requirements-txt > requirements-lambda.txt

build-Api:
	python3 -m pip install --no-cache-dir -r requirements-lambda.txt -t "$(ARTIFACTS_DIR)"
	cp -r src/sanposcape "$(ARTIFACTS_DIR)/sanposcape"
# ★ マイグレーションの置き先を `alembic` にしてはいけない。pip が PyPI の `alembic`
#   パッケージを `$(ARTIFACTS_DIR)/alembic` に展開済みのため、`cp -r alembic <dest>/alembic`
#   は「既存ディレクトリの中へコピー」と解釈され、成果物が `<dest>/alembic/alembic/` に
#   潜り込む（= script_location から env.py が見つからず ImportError になる）。
#   ライブラリ名と衝突しない名前に置き、`aws_lambda/migrate.py` の
#   `_ALEMBIC_SCRIPT_LOCATION` と対で管理する。
	cp -r alembic "$(ARTIFACTS_DIR)/alembic_migrations"
	cp alembic.ini "$(ARTIFACTS_DIR)/alembic.ini"
	find "$(ARTIFACTS_DIR)" -type d -name "__pycache__" -exec rm -rf {} +
	@if [ -n "$$(find "$(ARTIFACTS_DIR)" -maxdepth 1 -iname 'opentelemetry*' -print -quit)" ]; then \
		echo "ERROR: opentelemetry* が成果物に含まれています。ADOT レイヤーと版が混ざるため zip に入れないでください（ADR-013 決定1）" >&2; \
		exit 1; \
	fi

# API 本体と同じ成果物を使う（decision6: デプロイされたコードとマイグレーションの
# リビジョンを必ず一致させるため）。
build-Migrate: build-Api
