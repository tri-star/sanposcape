---
name: mobile-structure
description: packages/mobile の確定した規約・既存UI資産・Expo Router/Vitest の制約と落とし穴
metadata:
  type: project
---

# packages/mobile の要点（plan作成の前提）

**スタイル**: react-native-unistyles は撤去済み（ADR-005）。RN標準 `StyleSheet` を `@/theme/makeStyles((theme)=>...)` でラップ + `@/theme/useTheme()`。色/余白/角丸/影/文字は `src/theme/tokens.ts` のトークンから取得（ハードコード禁止）。**Unistyles 前提の記述は書かない**。

**Text プリミティブは存在しない** → RN の `Text` を直接 import し theme トークンでスタイルする（`DesignSystemGallery.tsx` が手本）。

**既存UIプリミティブ（`src/components/ui/<kebab>/<Pascal>.tsx`）**: Button/IconButton/Card/Badge/Tag/Input/Checkbox/Switch/Tabs/TabBar/StatBlock/ProgressBar/Dialog/BottomSheet/Toast/MapPin/Icon。操作ハンドラ(onPress/onChange)は基本**必須**設計（押せて何もしないを禁止、無効化は disabled 明示）。Tag のみ静的表示で onPress 省略可。アイコンは `Icon` 経由のみ、名前は `src/components/ui/icon/iconRegistry.ts` の kebab-case キー（無ければ1行追加）。

**Expo Router v57 / `typedRoutes:true` / scheme "sanposcape"**（packages/mobile/app.json）。ルート文字列は型検査される。`app/index.tsx` は `/`。`(tabs)/index.tsx` を作ると `/` と衝突するので、スプラッシュを index に置くならタブは `home.tsx` 等の名前付きにする。ルート `app/_layout.tsx` が Provider（QueryClient→Theme→SafeArea→Stack）を配線済み。

**Vitest 制約（重要）**: `vitest.config.ts` は `environment:"node"` / `include:["src/**/*.test.ts"]`（**.tsx は対象外**）で `react-native` を最小スタブに差し替え。→ **コンポーネント/レンダリングのテストは書けない**。ロジックは `react-native` を値 import しない純粋関数 `.ts` に切り出して `.test.ts` でテスト（既存例: `src/lib/{formatDuration,toPercent,hitSlop}.test.ts`, `src/theme/tokens.test.ts`）。テストは co-location。

**パスエイリアス**: `@/` → `src/`、`@/assets/` → `assets/`（tsconfig）。WSL2/Linux は case 区別 → import は実ファイル名と大文字小文字まで一致。

**services 層の seam パターン**: `src/services/<svc>/{types.ts,index.ts,<svc>.stub.ts,<svc>.real.ts}`。index が `process.env.EXPO_PUBLIC_*` で real/stub 選択。呼び出し側は index/types のみ参照。単体テストは常に stub、E2E(Maestro)は再現可能なら real。`src/services/auth/` は実在（SS-10 で real/dev/mock の3モードへ再設計）。`location` は未実装。認証の確定設計は [認証アーキテクチャ](auth-architecture.md) を参照。

**API**: Orval 生成物は `src/api/generated/`（手編集禁止、`pnpm --filter mobile orval` で再生成）。現状 `health` と `spots` のみ生成済み。**walks/履歴・散歩記録保存の API は未定義**（履歴/保存を実データ化するなら backend 伝達が必要）。クライアントは `src/api/client.ts`（customFetch）+ `queryClient.ts`。

**msw は使う（重要な訂正）**: orval.config.ts が `mock: true` で MSW ハンドラを生成し、`src/test/setup.ts` が `setupServer()` を全テスト共通で起動（`onUnhandledRequest: "error"`）。`src/api/client.test.ts` が実例。エージェント定義ファイルの「mobile では msw を使わない」は**この repo の実態と食い違う**ので、プランでは msw 利用を前提にしてよい。

**状態**: サーバ状態=TanStack Query、クライアント状態=Zustand（横断は `src/store/useAppStore.ts`、機能限定は features 内）。

**既存ユーティリティ**: `@/lib/formatDuration`(分→「◯時間◯分」), `@/lib/toPercent`, `@/lib/hitSlop`(hitSlopFor)。

**フルスクリーンのデザインモック(.pen等)はリポジトリに無い**（`src/features/design-system/components/DesignSystemGallery.tsx` がプリミティブ一覧＝実質のUI見本）。画面は既存プリミティブ＋各コンポーネントのJSDocが示す用途から構成する。
