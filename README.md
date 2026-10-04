# sanposcape

散歩支援アプリ。現在地から「往復にかけたい時間」内で往復できる範囲のスポットを提示して散歩先・散歩ルートを決め、歩いた散歩ルートを記録して振り返れるモバイルアプリと、そのバックエンドAPI。

- **ルート計画**: 現在地と往復時間を指定 → 範囲内のスポット候補を地図・リストで提示 → スポットを選んで散歩開始。
- **散歩の記録**: 歩いた散歩ルート（軌跡・所要時間・距離）を記録し、履歴として振り返る。

構成は **mobile（React Native / Expo）+ backend（FastAPI）+ lp（紹介サイト。Astro）** のモノレポ。LP は [packages/lp](./packages/lp/AGENTS.md) を参照。

## ドキュメント

- [プロジェクト概要](./docs/project-overview.md) — 目的・MVP・技術スタック・ビジョン・用語集
- [Gitコミットガイドライン](./docs/git-commit-guideline.md)
- ADR（アーキテクチャ決定記録）
  - 横断: [ADR-001 地図・POI に Google Maps Platform を採用（backend経由）](./docs/adr/ADR-001-map-poi-google-maps-platform.md)
  - 横断: [ADR-002 認証は Google 直結 + モバイル public client + backend 自前セッショントークン、スタブは3モードで切り替える](./docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)
  - 横断: [ADR-003 散歩記録は「終了時に1回保存する完了済みの散歩」として永続化し、履歴は keyset ページネーションで返す](./docs/adr/ADR-003-walk-record-persistence-and-history-api.md)
  - 横断: [ADR-004 シークレットの保管先は「消費者」で決め、CI から AWS への認証は OIDC を使う](./docs/adr/ADR-004-secrets-management-and-cicd-aws-credentials.md)
  - 横断: [ADR-005 backend は Lambda Function URL(AWS_IAM) + CloudFront で公開し、SAM で zip デプロイする](./docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)
  - 横断: [ADR-006 mobile アプリの配信は EAS（Expo ホスト）に委ね、mobile 用 SAM テンプレートを作らない](./docs/adr/ADR-006-mobile-app-delivery-eas-hosted.md)
  - 横断: [ADR-007 周回ルート（往路と異なる道で戻る）の生成方式](./docs/adr/ADR-007-loop-route-generation.md)
  - 横断: [ADR-008 デプロイとリリースを分離し、公開はフィーチャーフラグとストアの手動リリースで制御する](./docs/adr/ADR-008-deploy-release-separation.md)
  - 横断: [ADR-009 地図（SanpoMap）とピン（Pin）のデータモデル、写真の先行アップロードとサムネイル生成](./docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
  - 横断: [ADR-010 Astra向けハーネスとClaude定義の差分取り込み](./docs/adr/ADR-010-codex-astra-harness-and-incremental-import.md)
  - [リリース運用手順](./docs/release-runbook.md) — ADR-008 に基づく実際のリリース手順
  - mobile:
    - [ADR-M-001 フォルダ構造](./packages/mobile/adr/ADR-M-001-folder-structure.md)
    - [ADR-M-002 技術スタック（StyleSheet + Theme Context / TanStack Query + Zustand / react-native-maps / Orval）](./packages/mobile/adr/ADR-M-002-mobile-tech-stack.md)
    - [ADR-M-003 development build 前提と開発ループ](./packages/mobile/adr/ADR-M-003-development-build-and-dev-loop.md)
    - [ADR-M-004 E2E ビルド・CI 戦略](./packages/mobile/adr/ADR-M-004-e2e-build-ci-strategy.md)
    - [ADR-M-005 スタイルは Unistyles をやめる](./packages/mobile/adr/ADR-M-005-styling-without-unistyles.md)
    - [ADR-M-006 位置情報サービスは real/mock の2モード](./packages/mobile/adr/ADR-M-006-location-service-real-mock.md)
    - [ADR-M-007 Expo 設定と Maps SDK キーの注入](./packages/mobile/adr/ADR-M-007-expo-config-and-maps-key-injection.md)
    - [ADR-M-008 進行中/保存待ちの散歩の状態管理とルートのキャッシュ共有](./packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md)
    - [ADR-M-009 認証セッション状態の集約と認証ゲート](./packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md)
    - [ADR-M-010 写真サービスは real/mock の2モード、アップロードは presigned POST で S3 直送](./packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md)
    - [ADR-M-011 ピンの位置の選択と調整](./packages/mobile/adr/ADR-M-011-pin-location-picking-and-adjustment.md)
    - [ADR-M-012 登録済みピンの地図表示とピン詳細](./packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md)
    - [ADR-M-013 ピンのタグ入力の候補](./packages/mobile/adr/ADR-M-013-pin-tag-suggestions.md)
    - [ADR-M-014 地図一覧と地図詳細](./packages/mobile/adr/ADR-M-014-sanpo-map-list-and-detail.md)
    - [ADR-M-015 アプリアイコンのアセットとAndroid Adaptive Icon](./packages/mobile/adr/ADR-M-015-app-icon-assets.md)
    - [ADR-M-016 テーマ（外観）設定の端末保存](./packages/mobile/adr/ADR-M-016-theme-mode-preference.md)
    - [ADR-M-017 ピンの編集・削除](./packages/mobile/adr/ADR-M-017-pin-edit-and-delete.md)
    - [ADR-M-018 散歩中の位置記録はバックグラウンドのロケーションタスクで行う](./packages/mobile/adr/ADR-M-018-background-walk-location-tracking.md)
    - [ADR-M-019 地図のアイコンと、マップピンの形・マーカーの基準点](./packages/mobile/adr/ADR-M-019-sanpo-map-icon-and-map-pin-shape.md)
  - backend:
    - [ADR-B-001 backend テスト用DBの分離を「テーブルの中身を空にする」方式に変える](./packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md)
- backend
  - [フォルダ構造](./packages/backend/docs/folder-structure.md) / [命名規則](./packages/backend/docs/naming-convention.md)
  - [ツール・ライブラリ](./packages/backend/docs/toolsets-libraries.md) / [ローカル環境構築](./packages/backend/docs/local-env.md) / [ローカル開発ガイド](./packages/backend/docs/local-development.md)
- mobile
  - [フォルダ構造](./packages/mobile/docs/folder-structure.md) / [命名規則](./packages/mobile/docs/naming-conventions.md)
  - [ツール・ライブラリ](./packages/mobile/docs/toolsets-libraries.md) / [アーキテクチャガイドライン](./packages/mobile/docs/architecture-guideline.md) / [ページ・コンポーネント](./packages/mobile/docs/pages-components-guideline.md) / [ローカル環境構築](./packages/mobile/docs/local-env.md)
  - [iPhone実機 development build手順](./packages/mobile/docs/iphone-device-development.md)

## 技術スタック

### mobile (`packages/mobile`)

| カテゴリ | 技術 |
| --- | --- |
| 言語 | TypeScript |
| フレームワーク | React Native (Expo) + Expo Router |
| 状態管理 | TanStack Query（サーバー状態）+ Zustand（クライアント状態） |
| スタイリング | React Native 標準 `StyleSheet` + テーマ Context（デザイントークン・テーマは `src/theme` で管理。Unistyles は [ADR-M-005](./packages/mobile/adr/ADR-M-005-styling-without-unistyles.md) で撤回） |
| 地図 | react-native-maps |
| APIクライアント | Orval（OpenAPIから生成）+ MSWモック |
| テスト | Vitest（ユニット）/ Maestro（E2E） |
| Lint / Format | oxlint / oxfmt |
| パッケージ管理 | pnpm（minimumReleaseAge=2日） |

### backend (`packages/backend`)

| カテゴリ | 技術 |
| --- | --- |
| 言語 | Python |
| フレームワーク | FastAPI |
| ORM / マイグレーション | SQLAlchemy + Alembic |
| スキーマ | Pydantic |
| データベース | PostgreSQL（開発用DB + テスト用DBを分離） |
| 認証 | Google Sign-In 直結 + 自前セッショントークン（pyjwt[crypto]） |
| テスト | pytest |
| Lint / Format | ruff |
| パッケージ管理 | uv |
| 実行環境 | Docker Compose（api / db コンテナ） |

### 外部サービス / 共通

| カテゴリ | 技術 |
| --- | --- |
| 地図・POI・ルーティング | Google Maps Platform（Maps / Places / Routes） |
| CI/CD | GitHub Actions（Lint/Format・ユニットテスト・Maestro E2E） |
| OpenAPI | FastAPI の機能で出力し、mobile の Orval が消費 |

## アーキテクチャ

デプロイ後のシステム構成: **TBD**

- mobile: Expo 経由で配布（想定）
- backend / DB: ホスティング先 **TBD**
- Google Maps Platform 連携は **backend 経由**（キャッシュ/プロキシ層）で行い、クライアントから直接叩かない方針。

> 確定後に構成図とともに更新する。

## リポジトリ構成

```
.
├── docs/                 # プロジェクト横断のドキュメント
├── packages/
│   ├── backend/          # FastAPI アプリ（Docker Compose）
│   └── mobile/           # React Native (Expo) アプリ
└── scripts/              # 開発補助スクリプト（.env生成 等）
```

## セットアップ

ローカル開発環境のセットアップ手順は各パッケージのドキュメントを参照:

- backend: [ローカル環境構築手順](./packages/backend/docs/local-env.md)（Docker Compose）
- mobile: [ローカル環境構築手順](./packages/mobile/docs/local-env.md)

### クイックスタート

```bash
# 1. .env 生成（空きポートを自動割り当て）
bash scripts/initialize-dotenv.sh

# 2. backend 起動（Docker Compose）
cd packages/backend && docker compose up -d --build
docker compose exec api uv run alembic upgrade head
docker compose exec api uv run python scripts/seed.py

# 3. mobile 依存インストール & API クライアント生成
pnpm install
pnpm --filter mobile orval

# 4. （Android で地図を表示する場合）Maps SDK キーを設定
#    packages/mobile/.env の GOOGLE_MAPS_ANDROID_SDK_KEY に値を入れる
#    ※ EAS ビルドでは .env は使われないため EAS の環境変数に登録すること
#    詳細: packages/mobile/docs/local-env.md の「Google Maps（react-native-maps）」
```

WSL2 で backend の bind mount とコンテナの UID/GID を合わせる場合は、[backend ローカル環境構築手順](./packages/backend/docs/local-env.md#wsl2-の-uidgid-を合わせる) を参照。

> **⚠️ mobile は Expo Go ではなく development build が必要**
> react-native-maps / react-native-svg / react-native-nitro-google-signin（Google サインイン）/
> expo-secure-store（refresh token の永続化）/ expo-location（現在地取得）/
> expo-crypto（`x-amz-content-sha256` 用のボディ SHA-256 計算）/
> expo-image-picker（カメラ/写真ライブラリ）/ expo-image-manipulator（写真の縮小・再圧縮）/
> expo-file-system（加工後ファイルのバイト数取得）/ expo-task-manager（散歩中の背景位置記録）などの
> ネイティブモジュールを使うため、
> 動作確認には Expo の development build（dev client）を利用する（Expo Go では動作しない）。
> **SS-10（認証まわりのネイティブ依存を追加）・SS-15（expo-location の追加・Maps キー注入）・
> SS-70（expo-crypto の追加）・SS-88（expo-image-picker / expo-image-manipulator /
> expo-file-system の追加。ピン登録機能）・SS-156（expo-task-manager の追加と expo-location プラグイン設定の変更。
> 散歩中の背景位置記録）・SS-157（iOS: 位置情報の利用目的文言。Android: 通知権限 `POST_NOTIFICATIONS` の宣言）適用後は development build の作り直しが必要**
> （Fast Refresh では反映されない）。
> 詳細は [mobile ローカル環境構築手順](./packages/mobile/docs/local-env.md) を参照。
