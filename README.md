# sanposcape

散歩支援アプリ。現在地から「往復にかけたい時間」内で往復できる範囲のスポットを提示して散歩先・散歩ルートを決め、歩いた散歩ルートを記録して振り返れるモバイルアプリと、そのバックエンドAPI。

- **ルート計画**: 現在地と往復時間を指定 → 範囲内のスポット候補を地図・リストで提示 → スポットを選んで散歩開始。
- **散歩の記録**: 歩いた散歩ルート（軌跡・所要時間・距離）を記録し、履歴として振り返る。

構成は **mobile（React Native / Expo）+ backend（FastAPI）** のモノレポ。

## ドキュメント

- [プロジェクト概要](./docs/project-overview.md) — 目的・MVP・技術スタック・ビジョン・用語集
- [マイルストーン計画](./docs/milestones.md) — MVP達成までの M1〜M5
- [Gitコミットガイドライン](./docs/git-commit-guideline.md)
- ADR（アーキテクチャ決定記録）
  - 横断: [ADR-001 地図・POI に Google Maps Platform を採用（backend経由）](./docs/adr/ADR-001-map-poi-google-maps-platform.md)
  - backend: [ADR-002 認証は Google 直結 + モバイル public client + backend 自前セッショントークン、スタブは3モードで切り替える](./docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)
  - mobile:
    - [ADR-001 フォルダ構造](./packages/mobile/adr/ADR-001-folder-structure.md)
    - [ADR-002 技術スタック（Unistyles / TanStack Query + Zustand / react-native-maps / Orval）](./packages/mobile/adr/ADR-002-mobile-tech-stack.md)
    - [ADR-003 development build 前提と開発ループ](./packages/mobile/adr/ADR-003-development-build-and-dev-loop.md)
    - [ADR-004 E2E ビルド・CI 戦略](./packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md)
- backend
  - [フォルダ構造](./packages/backend/docs/folder-structure.md) / [命名規則](./packages/backend/docs/naming-convention.md)
  - [ツール・ライブラリ](./packages/backend/docs/toolsets-libraries.md) / [ローカル環境構築](./packages/backend/docs/local-env-design.md) / [ローカル開発ガイド](./packages/backend/docs/local-development.md)
- mobile
  - [フォルダ構造](./packages/mobile/docs/folder-structure.md) / [命名規則](./packages/mobile/docs/naming-conventions.md)
  - [ツール・ライブラリ](./packages/mobile/docs/toolsets-libraries.md) / [アーキテクチャガイドライン](./packages/mobile/docs/architecture-guideline.md) / [ページ・コンポーネント](./packages/mobile/docs/pages-components-guideline.md) / [ローカル環境構築](./packages/mobile/docs/local-env-design.md)
  - [iPhone実機 development build手順](./packages/mobile/docs/iphone-device-development.md)

## 技術スタック

### mobile (`packages/mobile`)

| カテゴリ | 技術 |
| --- | --- |
| 言語 | TypeScript |
| フレームワーク | React Native (Expo) + Expo Router |
| 状態管理 | TanStack Query（サーバー状態）+ Zustand（クライアント状態） |
| スタイリング | react-native-unistyles（デザイントークン・テーマ） |
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
```

> **⚠️ mobile は Expo Go ではなく development build が必要**
> Unistyles / react-native-maps などのネイティブモジュールを使うため、
> 動作確認には Expo の development build（dev client）を利用する（Expo Go では動作しない）。
> 詳細は [mobile ローカル環境構築手順](./packages/mobile/docs/local-env.md) を参照。
