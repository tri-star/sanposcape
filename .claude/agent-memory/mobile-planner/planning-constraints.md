---
name: planning-constraints
description: mobile プランを書くたびに効いてくる制約（ADR の位置づけ、テスト不能な層、oxlint の import 制限）と確認順序
metadata:
  type: project
---

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
