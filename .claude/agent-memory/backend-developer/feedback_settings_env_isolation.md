---
name: feedback_settings_env_isolation
description: backend の Settings(pydantic-settings) はテスト実行時に開発者ローカルの .env / OS 環境変数から構造的に隔離されている（SS-100）。テストで Settings(...) を明示構築するときの前提。
metadata:
  type: feedback
  scope: durable
---

`src/sanposcape/config.py` の `Settings`（`pydantic_settings.BaseSettings`）は
`model_config = SettingsConfigDict(env_file=".env", extra="ignore")` を持ち、
`.env` ファイルと OS 環境変数の両方を読む。`packages/backend/compose.yaml` の
`api.environment` セクションは `.env` の値の一部（`FEATURE_FLAG_MODE`, `AUTH_MODE`,
`ENV`, `DB_HOST` など）を **OS 環境変数としてもコンテナに渡す**ため、`.env` ファイルを
無効化するだけでは不十分（OS 環境変数側にも同じ値が乗る）。

SS-100 でこれが実害になった: `.env.example`（→ `scripts/initialize-dotenv.sh` が生成する
`.env`）は `FEATURE_FLAG_MODE=stub` を配っており、`Settings(env="test")` のように
一部フィールドだけを明示したテストが、渡さなかった `feature_flag_mode` で `.env` /
OS 環境変数の値を拾ってしまい、`.env` を生成した開発者の手元でだけテストが落ちていた
（CI には `.env` が無いため気付けなかった）。

**対策（`src/sanposcape/conftest.py` の autouse フィクスチャ
`_isolate_settings_from_ambient_env`）**: 各テスト実行前に
1. `Settings.model_fields` の全フィールド名に対応する環境変数を `monkeypatch.delenv`
2. `monkeypatch.chdir(tmp_path)`（相対パスの `env_file=".env"` の解決先を空にする）

を行うことで、テストコード内で `Settings(...)` を明示構築するとき「渡さなかった
フィールドは常にコード上のデフォルト値になる」ことをスイート全体で保証している。

**How to apply**:
- 新しいテストで `Settings(...)` を構築するときは、この隔離が自動的に効くことを
  前提にしてよい。検証したいフィールドだけを明示すれば十分で、無関係なフィールドに
  `feature_flag_mode="real"` のような値を防御的に渡し回る必要は無い。
- `conftest.py` モジュールレベルの `settings = get_settings()`（`test_database_url` の
  組み立て用）は、このフィクスチャより前（pytest 収集＝モジュール import 時）に評価
  されるため対象外。テスト用DB接続は引き続き実際の `.env` / OS 環境変数から解決される。
  「`.env` から一律に独立させる」対応をする際は、ここを壊さないよう注意すること。
- `main.py` の `app = create_app()`（ambient な `main.app`）も同様に import 時に
  一度だけ構築されるため、このフィクスチャの影響を受けない
  （`auth/tests/conftest.py` 等が「ambient な `.env` に意図的に依存する」と明記して
  いるテストの前提を壊さない）。
- pydantic-settings (v2.15 時点) には OS 環境変数ソースだけを無効化する単純な kwarg は
  無い（`_env_file=None` は dotenv ソースのみを無効化する）。`monkeypatch.delenv` が
  最も単純な回避策。
- ローカルで「`.env` が本当に無い状態」を検証したい場合、コンテナは `.env` を使って
  起動済みだと OS 環境変数がコンテナ生成時に焼き込まれたまま残る
  （`docker compose up -d --build` 等でコンテナを作り直すまで消えない）。
  厳密な再現にはコンテナ再作成が要るが、`COMPOSE_PROJECT_NAME` / ポートが変わり
  他の worktree と衝突しうるので注意（`-e VAR=value` での場当たり的な上書きより、
  `/app/.env` ファイルだけ削除して「OS 環境変数は汚染されたまま」という CI より厳しい
  条件で確認する方が安全）。

関連ドキュメント: `packages/backend/docs/local-env.md` の「テストと `.env` の関係（SS-100）」節。
