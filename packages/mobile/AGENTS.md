# mobileに関する開発ドキュメント

## 設計ガイドライン

- 利用するべきライブラリ、Linter/Formatterなどのツールセットは [ツール・ライブラリ] (./docs/toolsets-libraries.md) を参照
- アーキテクチャに関するガイドラインは [アーキテクチャガイドライン](./docs/architecture-guideline.md) を参照
- mobileに関するフォルダ構造は [フォルダ構造](./docs/folder-structure.md) を参照
- ファイル/フォルダの命名規則は [ファイル命名規則](./docs/naming-conventions.md) を参照
- ページ、コンポーネントの実装に関するガイドラインは [ページ・コンポーネント](./docs/pages-components-guideline.md) を参照

## 環境構築・起動手順

- ローカル環境の構築手順は [ローカル環境構築](./docs/local-env.md) を参照
- エミュレータ/実機での起動手順は [起動手順ガイド](./docs/app-startup-guide.md) を参照
- iPhone実機での development build は [iPhone実機 development build 手順](./docs/iphone-device-development.md) を参照

## ADR（設計判断の記録）

**設計を変える実装に着手する前に、該当する ADR を読むこと。** ガイドラインが「何をするか」を、
ADR が「なぜそうなっているか」を持っている。ADR の決定を覆す変更をする場合は、
ADR の追補（または新規 ADR の作成）が必要（[adr-writing](../../.claude/skills/adr-writing/SKILL.md) スキルを使う）。

mobile 固有の判断は `adr/` 配下、frontend/backend にまたがる判断や
ドメイン知識は [`docs/adr/`](../../docs/adr/)（リポジトリルート）にある。

| ADR | 主題 |
|---|---|
| [ADR-001](./adr/ADR-001-folder-structure.md) | フォルダ構造と命名規則 |
| [ADR-002](./adr/ADR-002-mobile-tech-stack.md) | 技術スタック（スタイル・状態管理・地図・APIクライアント） |
| [ADR-003](./adr/ADR-003-development-build-and-dev-loop.md) | development build 前提の開発ループ |
| [ADR-004](./adr/ADR-004-e2e-build-ci-strategy.md) | E2E(Maestro) のビルド方式と CI コスト戦略（依存追加が APK キャッシュに効く） |
| [ADR-005](./adr/ADR-005-styling-without-unistyles.md) | スタイルは RN の StyleSheet + テーマ Context |
| [ADR-006](./adr/ADR-006-location-service-real-mock.md) | 位置情報サービスは real/mock の2モード |
| [ADR-007](./adr/ADR-007-expo-config-and-maps-key-injection.md) | Expo 設定と Maps SDK キーの注入 |
| [ADR-008](./adr/ADR-008-active-walk-state-and-route-cache.md) | 進行中/保存待ちの散歩の状態管理とルートのキャッシュ共有 |
| [ADR-009](./adr/ADR-009-auth-session-state-and-route-gate.md) | 認証セッション状態の集約と認証ゲート |
