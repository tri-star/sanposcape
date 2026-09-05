---
name: reference-sam-cli-not-installed
description: aws-sam-cli はこの開発環境に未インストール。指示に反してインストールせず、代替検証手段を使うこと
metadata:
  type: reference
  scope: durable
---

`aws-sam-cli`（`sam` コマンド）はこのリポジトリのローカル開発環境（devcontainer/ホスト）に
入っていない。`pip show aws-sam-cli` / `which sam` で未検出を確認済み（2026-09-05）。
Docker 自体はホストで利用可能。

**Why:** SAM ベースのデプロイ作業（`sam validate --lint` / `sam build --use-container` /
`sam local invoke` 等）を求められても、ツールが存在しないため実行できない。
ユーザー指示（SS-67）では「入っていない場合はインストールせず、未実施として報告する」ことが
明示されており、これは環境方針として今後も踏襲すべき制約と考えられる。

**How to apply:**
- `sam` を使う作業が発生したら、まず `which sam` / `sam --version` で存在確認する。
- 無ければインストールを試みず、ユーザー/親エージェントに「未実施」であることと理由を明記して
  報告する。
- 代替の検証手段（sam CLI 不在時でも一定の信頼度が得られるもの）:
  - CloudFormation/SAM テンプレート（YAML）の構文検証: `pyyaml` の `SafeLoader` を継承し、
    `!Ref`/`!Sub`/`!FindInMap`/`!If`/`!GetAtt` 等の CFN 短縮タグをすべて `add_multi_constructor`
    で受け流すローダーを自作して `yaml.load()` する（意味検証ではなく構文検証のみ）。
  - `samconfig.toml` は標準ライブラリ `tomllib` でパースするだけで構文検証できる。
  - `Makefile`（`BuildMethod: makefile`）は `ARTIFACTS_DIR=<dir> make -n build-<LogicalId>` で
    ドライラン確認できる（実行はしない）。
  - Lambda ハンドラの実体は `sam build`/`sam local invoke` に頼らず、素の Python で疎通確認できる:
    1. `uv export --frozen --no-dev --no-emit-project --format requirements-txt` で
       ランタイム依存だけの requirements を生成
    2. `uv pip install -r <requirements> --target <dir>`（uv 管理 venv に `pip` モジュールが
       無いことがあるので `python -m pip` ではなく `uv pip ... --target` を使う）
    3. アプリの `src/<package>` をその `<dir>` へコピー
    4. `PYTHONPATH=<dir>:<boto3 等ランタイム同梱想定パッケージのパス>` を設定し、
       ハンドラ関数を直接 import・呼び出しして疎通確認する
    5. ただしこれは AWS 公式ビルドイメージ（`public.ecr.aws/sam/build-python3.12` 等）による
       glibc/manylinux 互換性の担保にはならない。あくまで近似であることを報告に明記する。
