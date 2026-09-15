---
name: mobile-development
description: React Native/Expoの計画・実装・検証を行う。画面、状態管理、API、認証、位置情報、端末依存機能が対象。
---

# Mobile 開発

メインが担当する。[mobile規約](../../../packages/mobile/AGENTS.md) から該当の構成・命名・設計・ツール文書を読み、設計変更前にmobile ADRと共通ADRを確認する。

画面/ルーティング、feature内のUI/状態/純粋ロジック、servicesの端末依存処理の責任を分ける。`app/` は画面とルーティング、生成APIは手編集しない。API・権限・バックグラウンド/復帰・圏外・キャンセルの挙動を計画する。状態管理・スタイル・real/dev/mockの選択は現在のADRで確認する。

backend変更を伴う場合はスキーマ → OpenAPI → Orval → mobile実装の順で契約を揃える。ネイティブ依存・Expo設定変更はdevelopment buildへの反映要否を確認する。

package scriptsで型・lint・関連テストを行う。Vitestで扱う純粋ロジックと端末で確認するRN/ネイティブ動作を区別する。画面・端末変更は [端末確認](references/device-verification.md)。`.env` 不在なら [local-env-setup](../local-env-setup/SKILL.md)。

実装後は [change-review](../change-review/SKILL.md)。端末検証不能なら試したこと・未確認操作・必要な環境を報告し、型チェックだけで動作確認済みにしない。
