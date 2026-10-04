---
name: planning-constraints
description: mobile プランを書くたびに効いてくる制約（ADR の位置づけ、テスト不能な層、oxlint の import 制限）と確認順序
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-001-folder-structure.md
---

読む順序と ADR の書き方は [[planning-inputs]]。**ADR の決定を覆す変更は追補が必須**（`adr-writing` skill）。

**Why:** この repo は設計判断が ADR に厚く蓄積されており、コードだけ読んで書いたプランは既存判断と衝突する。

**How to apply:** プランには必ず「どの ADR に何を追補するか」を作業項目として含める。既存決定を否定しない場合でも、範囲の明確化として追補を書く価値がある。

**「別課題で削除する」予告を拾う**: 過去の計画が ADR 追補・JSDoc・Maestro のコメントに「◯◯の別課題で削除」と残していることがある
（例: SS-146 → `/pins/map`・`/pins/pick-location`）。チケット本文に書かれていなくても、プラン作成時に
`rg '別課題'` で拾い、今回がその課題に当たるなら「分離可能なフェーズ」としてスコープに含めるかを決めて handover に残す。
含めない場合でも、予告の文言を更新しないと陳腐化する。

毎回効いてくる制約:
- **hooks / components はテストできない**。テストの置き場と msw の使い方は [[mobile-testing]]。
- **`features/walk/**` `features/history/**` `features/pin/**` から `@/services/auth*` `@/store/useAuthSessionStore` は oxlint でエラー**（ADR-M-009 決定8）。認証由来の値は `app/` のルートが読んで **props で注入**する（実例: `app/(tabs)/account.tsx`、`app/walk-summary.tsx`、`app/pins/new.tsx`）。逆向き（`features/auth` → `features/walk/store`）は許可。`src/**` から `@/config/devTools` も禁止（`app/` だけが読む）。
- zustand のセレクタは**プリミティブを返す**（v5 で毎レンダー再生成を避ける）。
- `features/<f>/api/` は Orval の**素の fetcher をラップ**する（生成 hook は使わない）。`queryKey` はドメイン名始まり（保存後の `invalidateQueries(["walks"])` に合わせる）。
- 主要画面（`app/` のルート）を追加したら `ScreenCatalog`（`/dev-screens`）にエントリを1件足す。副作用があるエントリは `docs/pages-components-guideline.md` の表にも1行足す。
- **EAS ビルド / 配布 / 環境変数の正本は `packages/mobile/docs/build-profiles.md`**（プロファイルごとの backend の向き先・値の供給元・既定ビルドクレデンシャルを変えるなという警告まで集約されている）。この領域のプランはコードより先にここを読む。
- E2E は `.maestro/` 直下がフロー、`subflows/` は `runFlow` 専用。`appId` は開発用識別子 `com.sanposcape.app.dev` で**複数ファイルにハードコード**され（フローが増減するので固定の件数は書かず、`rg -l 'com\.sanposcape\.app\.dev' packages/mobile/.maestro` で都度数える）、`openLink` の scheme `sanposcape-dev://` も同様に複数ファイルにある（SS-79 で本番と分割済み。識別子の SSoT は `docs/build-profiles.md` の「アプリ識別子の定義」）。識別子や scheme を変える案は必ずこことセットで見る。（「依存追加で APK キャッシュがミスする」は ADR-M-004 の 2026-08-14 追補で撤回済み。）
- **新機能は最初からフィーチャーフラグ前提で書く**（ルート ADR-008）。ただし `docs/release-runbook.md`「すべての変更をフラグで包む必要はあるか」が例外を認めている。包まないなら理由を handover に書く（例: 起動直後に同期で適用したい設定はフラグの非同期取得と両立しない。SS-86）。E2E で ON にするには backend を `ENV=test FEATURE_FLAG_MODE=stub FEATURE_FLAG_STUB_DOCUMENT=...` で起動する（`compose.yaml` は `FEATURE_FLAG_STUB_DOCUMENT` を渡す。CI 側の指定は `mobile-e2e.yml` を確認）。`app/` の画面ガードは `docs/architecture-guideline.md` の「画面ガードレシピ」。
