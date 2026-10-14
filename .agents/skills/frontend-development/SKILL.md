---
name: frontend-development
description: Webの計画・実装・検証を行う。既存のAstro LP、ページ、コンポーネント、API連携、アクセシビリティ変更が対象。
---

# Web 開発

メインが担当する。既存Webは `packages/lp`（Astroの静的サイト）。[lp規約](../../../packages/lp/AGENTS.md)・[ADR-012](../../../docs/adr/ADR-012-lp-static-site-astro-s3-cloudfront.md)・package.jsonと類似実装から構成・スタイル・配信・検証方法を確認する。規約をskillに書き写さない。

Reactアプリは未作成。[frontendテンプレート](../launch-project/assets/initial-contents/packages/frontend/) は新規構築時の初期案であり、lpの既存規約と扱わない。React前提のhook・状態管理・認証等は、それらを導入する依頼の場合だけ検討する。

計画にはユーザー操作、画面遷移、loading/empty/error/success、API契約、認証境界を含める。UI状態とサーバー状態の所有者、キーボード操作、フォーカス、非同期競合を確認する。API変更は [backend-development](../backend-development/SKILL.md) と契約を揃える。

実在するpackage scriptsを使う。lpは `pnpm --filter lp check`、`pnpm --filter lp format:check`、`pnpm --filter lp build` とlp規約のビルド後検査を実施する（存在しないtest/lint scriptを要求しない）。画面変更はブラウザでも検証する。Orca内なら利用可能な `orca-cli`、それ以外なら利用可能なブラウザ検証手段を使う。未実施の画面確認は明示する。

全体進行は [task-workflow](../task-workflow/SKILL.md)、実装後は [change-review](../change-review/SKILL.md)。
