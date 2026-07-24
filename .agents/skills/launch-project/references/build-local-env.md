# ローカル環境構築手順

## .envファイル自動生成に向けた環境構築

### packages/frontend/.env.example

以下の内容で作成。フォルダも作成する。

```env
VITE_PUBLIC_BACKEND_API_URL=http://localhost:{%BACKEND_API_PORT%}
FRONTEND_DEV_PORT={%FRONTEND_DEV_PORT%}
STORYBOOK_DEV_PORT={%STORYBOOK_DEV_PORT%}
```

### packages/backend/.env.example

以下の内容で作成。フォルダも作成する。

```env
BACKEND_API_PORT={%BACKEND_API_PORT%}
DB_PORT={%DB_PORT%}
DB_USER=app
DB_PASSWORD=password
DB_NAME=app
TEST_DB_NAME=app_test
```

### プロジェクトの初期ファイル一式のコピー

- `scripts/copy-initial-contents.sh` をbashで実行して、プロジェクトのルートフォルダに初期ファイルをコピーする。
  - これにより、.env ファイル自動生成スクリプト(initialize-dotenv.sh)や、.editorconfig、frontend/backendの最低限のドキュメントファイルがコピーされる。
- `<project-root>/scripts/initialize-dotenv.sh` を実行して.envを生成する。

---

## backendの構築手順

- `<project-root>/packages/backend` に移動
- Dockerfile, compose.yamlの作成
- API用コンテナ内にruff, FastAPI, SQLAlchemyのインストール
- ローカル環境アプリ用DB、テスト用DBの作成
- 動作確認用にテスト用テーブルを作成、マイグレーション実行の動作確認
- frontendとのOpenAPI連携テスト用APIエンドポイントの作成
  - openapi.yamlをファイルに出力
- pytestの動作確認
- backendのLint/Formatチェック用GitHub Actionsワークフローの作成
- backendのtest用GitHub Actionsワークフローの作成

---

## frontendの構築手順

- `<project-root>` で pnpm を初期化。`packages/*` をワークスペースに追加
- `<project-root>/packages/frontend` に移動
- 各種ライブラリのインストール
  - .env の自動ロードのために dotenv も必要
- Lint, Formatの動作確認
- backendのopenapi.yamlからOrvalでClientコードとmswモックの生成ができることを確認
  - **OrvalのHTTPクライアントは`fetch`または`customFetch`を利用する**
- `design-token-tool` Skill を利用して、デザイントークンの決定と、ビルドの仕組みを整備
- vitestでOpenAPI連携テストの動作確認
- `design-token-tool` Skill を利用して、デザイントークンを確認
- テスト用ページ・コンポーネントを作成
  - デザイントークンを活用しながらページを作成。
- Storybookの動作確認
  - ページ・コンポーネントのStoryを作成
- E2E test(Playwright)の動作確認
- frontendのLint/Formatチェック用GitHub Actionsワークフローの作成
- frontendのtest(vitest)用GitHub Actionsワークフローの作成
- frontendのtest(E2E test)用GitHub Actionsワークフローの作成

---

## 完了条件

- [ ] `<project-root>/packages/backend` 配下に compose.yaml が存在し、Dockerfileをビルドして立ち上がる設定になっている
- [ ] `<project-root>/packages/frontend` 配下に .envが作成されている
- [ ] `<project-root>/packages/frontend` 配下で `pnpm dev`, `pnpm storybook` 実行時、dotenvで環境変数が読み込まれている
- [ ] OrvalによるClientコード、mswモックが生成されている
- [ ] デザイントークン(primitive, semanticともに)のJSONが作成されている
- [ ] テスト用のページ、コンポーネントが作成されており、デザイントークンのsemanticトークンが使用されている
- [ ] Storybookでテスト用ページ、コンポーネントのStoryが作成されている
- [ ] PlaywrightによるE2Eテストが実行できる状態になっている
