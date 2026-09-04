# SAM `BuildMethod: makefile` 用のビルドスクリプト（packages/backend/ 直下）。
#
# `sam build --use-container` は各 AWS::Serverless::Function の論理IDごとに
# `make build-<論理ID>` を呼ぶ。本プロジェクトは src レイアウト + uv 依存管理のため、
# SAM 標準の python-pip ワークフロー（CodeUri 直下の requirements.txt 前提）ではハンドラの
# モジュールパスが解決できない。ここで成果物を明示的に組み立てる
# （tmp/SS-67/backend-plan.md 決定8）。
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

.PHONY: lambda-requirements build-Api build-Migrate

lambda-requirements:
	uv export --frozen --no-dev --no-emit-project --format requirements-txt > requirements-lambda.txt

build-Api:
	python3 -m pip install --no-cache-dir -r requirements-lambda.txt -t "$(ARTIFACTS_DIR)"
	cp -r src/sanposcape "$(ARTIFACTS_DIR)/sanposcape"
	cp -r alembic "$(ARTIFACTS_DIR)/alembic"
	cp alembic.ini "$(ARTIFACTS_DIR)/alembic.ini"
	find "$(ARTIFACTS_DIR)" -type d -name "__pycache__" -exec rm -rf {} +

# API 本体と同じ成果物を使う（decision6: デプロイされたコードとマイグレーションの
# リビジョンを必ず一致させるため）。
build-Migrate: build-Api
