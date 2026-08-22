---
name: planning-constraints
description: mobile プランを書くたびに効いてくる制約（ADR の位置づけ、テスト不能な層、oxlint の import 制限、backend 型の先行取り込み）と確認順序
metadata:
  type: reference
  scope: durable
---

> このファイルは**決定の正本ではなく、正本（ADR / docs）への道案内と、毎回参照する運用上の制約**をまとめたもの。
> 各項目の正本: `packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md`（E2E/CI）、
> `packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md` 決定8（import 制限）、
> `packages/mobile/docs/architecture-guideline.md`（テスト方針）、`packages/mobile/docs/folder-structure.md`。

プラン作成前に読む順序: `packages/mobile/AGENTS.md`（ADR 一覧つき）→ 該当 ADR（`packages/mobile/adr/`）→ `docs/architecture-guideline.md` / `folder-structure.md` → 実コード。
ガイドラインが「何をするか」、ADR が「なぜそうなっているか」を持つ。**ADR の決定を覆す変更は追補が必須**（`adr-writing` skill）。

**Why:** この repo は設計判断が ADR に厚く蓄積されており、コードだけ読んで書いたプランは既存判断と衝突する。

**How to apply:** プランには必ず「どの ADR に何を追補するか」を作業項目として含める。既存決定を否定しない場合でも、範囲の明確化として追補を書く価値がある。

毎回効いてくる制約:
- **hooks / components はテストできない**（vitest は node 環境 + `react-native` 最小スタブ）。テストしたいロジックは `features/<f>/lib/` か `src/lib/` の純粋関数へ切り出すのが原則。ストア（zustand）と `features/<f>/api/` の素の fetcher（msw 可）はテストできる。
- **`features/walk/**` `features/history/**` から `@/services/auth*` `@/store/useAuthSessionStore` は oxlint でエラー**（ADR-009 決定8）。認証由来の値は `app/` のルートが読んで **props で注入**する（実例: `app/(tabs)/history.tsx`、`app/walk-summary.tsx`）。逆向き（`features/auth` → `features/walk/store`）は許可。
- zustand のセレクタは**プリミティブを返す**（v5 で毎レンダー再生成を避ける）。
- `features/<f>/api/` は Orval の**素の fetcher をラップ**する（生成 hook は使わない）。`queryKey` はドメイン名始まり（保存後の `invalidateQueries(["walks"])` に合わせる）。
- 主要画面（`app/` のルート）を追加したら `ScreenCatalog`（`/dev-screens`）にエントリを1件足す。副作用があるエントリは `docs/pages-components-guideline.md` の表にも1行足す。
- E2E は `.maestro/` 直下がフロー、`subflows/` は `runFlow` 専用。**依存パッケージを増やすと E2E の APK キャッシュを1回ミスする**（ADR-004）ので、フロー追加だけなら安い。
- **backend の API 拡張を待つプランを「ブロック」と書かない**。`packages/backend/openapi.yaml` は `app.openapi()` の生成物なので「スキーマだけ先行マージ」はできないが、backend が schemas + openapi 生成を単独コミットにすれば、mobile は `git checkout origin/<backend-branch> -- packages/backend/openapi.yaml` → `pnpm --filter mobile orval` で**型生成・純粋関数・単体テストまで先行できる**（`orval.config.ts` の input は相対パスなので設定変更不要）。取り込んだ `openapi.yaml` は mobile の PR にコミットしない。この段階の backend は service が未実装でレスポンス検証エラーになるため、**実 API を使う E2E だけは backend の PR が ready になるまで走らない**。
- **Orval の msw モックは OpenAPI から faker で生成される**。レスポンスにフィールドが増えると生成される既定モック値が変わるので、テストはハンドラの既定値に依存させず明示的に上書きする。
