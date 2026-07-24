---
name: launch-project
description: "プロジェクトの開始時にfrontend(option)/mobile(option)/backendのローカル環境、CIを整備し、実装->テストのサイクルを回せる状態をセットアップします。"
metadata:
  claude:
    argument-hint: "[project-description]"
---

frontend(option)/mobile(option)/backendを含んだモノレポのプロジェクトを組織のルールに合わせて初期化し、最低限の実装で動作する基盤を整備します。
(frontend/mobileはオプションで、両方、または片方しか存在しないケースもあります)

# 目標

AIエージェント、ユーザーが動作を確認しエラーや問題がないことを確認しながら進めるループを回せる状態を作ることを目指します。

# 技術スタック

- frontend (option)
  - ユーザーと相談の上、React/React Router/Nuxt.js v4 のいずれかを利用して構築します。
    バンドラーはViteを利用。
  - lint, formatはoxlint, oxfmtを利用して整備します。
  - 状態管理: ユーザーと相談。推奨があれば提案してください。
  - UIライブラリ: TailwindCSSを利用しつつ、独自に定義したデザイントークンでテーマを生成して進めます。
  - デプロイ先プラットフォーム: AWS、CloudFront + S3を想定
- mobile (option)
  - React Nativeを利用して構築します。
    バンドラーはViteを利用。
  - lint, formatはoxlint, oxfmtを利用して整備します。
  - 状態管理: ユーザーと相談。推奨があれば提案してください。
  - UIライブラリ: ReactNativeで一般的に利用するUIライブラリか、ライブラリを使用せずコンポーネント管理をしっかり行うかなど、ユーザーと相談。長期の運用を考慮する必要があります。
  - パッケージ管理は pnpmを利用。 minimumReleaseAge を設定し、2日以上経過したバージョンを利用。
  - テスト: 
    - ユニットテスト: vitestを利用
    - E2Eテスト: Maestroを利用。ローカルではAndroid環境はWindows側で動作するので、一部ユーザーの協力が必要になる想定。
  - CI: GitHub ActionsでのCI。CIでもMaestroによるE2Eテストを実行できるように整備します。
- backend
  - Docker Composeを利用し、コンテナ内でFast API, SQLAlchemy, ruff, pydanticを利用して構築します。
  - DBはPostgreSQLを利用します。

# 基本方針

開始時に整備しておくとレバレッジの効くものを整備したいです。
現時点では以下を想定していますが、これ以外にも効果のあるものがあれば取り入れたいです。

- 共通
  - GitHub Actions
  - Linter / Formatter
  - ローカル環境セットアップ
  - 空いているポートを見つけて.env作成
  - README.md
  - プロジェクト概要などのドキュメント
- Frontend
  - Storybook表示が出来るところまで整備
  - Playwright E2Eを実行できるところまで整備
  - デザイントークンビルドの仕組みの整備
  - OpenAPI定義からOrvalのClient生成、mswモック生成まで。
- Mobile
  - ReactNativeの初期化。expo startの準備まで(expo goによる動作確認はユーザーが行う)。
  - OpenAPI定義からOrvalのClient生成、mswモック生成まで。
- Backend
  - Seeder
  - Docker Compose
  - ローカル用DB(テスト用DBも作成)
  - OpenAPI定義出力できるところまで

- その他
  - 初期化ステップをAIに任せると独自の方法で頑張り始めるので、公式ドキュメントを参照の上で実施させる方針にする

# 本Skillで利用するフォルダ

- `<project-root>` : .gitフォルダがあるプロジェクトのルートと見なせるフォルダ
- `<frontend-root>` : `<project-root>/packages/frontend`
- `<mobile-root>` : `<project-root>/packages/mobile`
- `<backend-root>` : `<project-root>/packages/backend`

# 作業ステップ

## 1. ユーザーの要求のヒアリング

ユーザーの入力した `[project-description]` を元にプロジェクトの概要を把握します。
[プロジェクト概要テンプレート](./templates/project-overview.md) に記載された内容を埋めるにあたって、必要な情報が不足している場合はユーザーに質問して情報を集めます。

## 2. プロジェクト概要の作成

ユーザーからヒアリングした情報を元にプロジェクト概要を作成します。

詳細な手順は [プロジェクト概要関連ドキュメント](./references/project-overview.md) を参照してください。

## 3. backendのフォルダ構造、ファイル名命名規則ドキュメントの作成

backendについてのフォルダ構造、命名規則を決めます。
Plan Agentを利用してプランを作成し、ユーザーの同意を得たのち、ドキュメントに記録します。

- `<backend-root>/docs/folder-structure.md`
- `<backend-root>/docs/naming-convention.md`

## 4. (frontendありの場合)frontendのフォルダ構造、ファイル名命名規則ドキュメントの作成

frontendについてのフォルダ構造、命名規則を決めます。
Plan Agentを利用してプランを作成し、ユーザーの同意を得たのち、ドキュメントに記録します。

- `<frontend-root>/docs/folder-structure.md`
- `<frontend-root>/docs/naming-convention.md`

## 5. (mobileありの場合)mobileのフォルダ構造、ファイル名命名規則ドキュメントの作成

mobileについてのフォルダ構造、命名規則を決めます。
Plan Agentを利用してプランを作成し、ユーザーの同意を得たのち、ドキュメントに記録します。

- `<mobile-root>/docs/folder-structure.md`
- `<mobile-root>/docs/naming-convention.md`

## 6. README.mdの作成

現時点での内容で、 `<project-root>/README.md` を作成します。
これには以下のような見出しと内容を含めます。

- プロジェクトの概要
- ドキュメントへのリンク
  - プロジェクト概要
  - ADR (この時点では未作成だが、TBDなどでセクションだけ設けておく)
- 技術スタック
  - 使用言語やフレームワーク、ライブラリ、CI/CDツールなどを記載
- アーキテクチャ
  - デプロイ後のシステムのアーキテクチャ。未定義の場合、TBDとして記載しておく。

## 6. ローカル環境のセットアップ

ユーザーのローカル環境にプロジェクトをセットアップします。
ローカル環境の構築手順は `local-env-setup` skillを使用します。

