---
name: project_ss8_mvp_screens
description: SS-8（MVP主要画面の静的実装・ルーティング配線）レビュー時点の実装状況と、確認済みの設計整合ポイント
type: project
---

`tmp/SS-8/mobile-plan.md`（§4/§5/§8.5）に基づき、`app/*`（スプラッシュ/認証/散歩開始/散歩中/散歩終了/履歴/タブ）
と対応する `src/features/{auth,walk,history,navigation,search}/*` が実装済み（2026-07-24 時点でレビュー）。

**確認できた良好パターン（今後のレビューでも踏襲を期待してよい）:**
- `app/*` は全ルートで `*View`/`*Route` を返すだけの薄いラッパーに徹している（ロジック・スタイルなし）。
- 判定/整形ロジック（`reachableSpots` / `walkStatsFromElapsed` / `estimateRoundTripKm` / `categorySummary` /
  `buildPeriodChart` / `formatClock`）はすべて `react-native` を値 import しない純粋関数として `lib/` に切り出され、
  Vitest で co-location テスト済み。
- `src/services/auth`（interface + `auth.stub.ts`/`auth.real.ts` + `index.ts` の env 切替）が
  `docs/architecture-guideline.md` のスタブ差し替え方針どおりに実装されている。
- 画面間の状態受け渡しは Zustand 昇格ではなく router params（`useLocalSearchParams` + フォールバック既定値）で
  完結しており、プラン §8.5 の「まず params」方針と一致。単独で直接そのルートを開いても壊れないよう
  すべてのパラメータにフォールバック値がある点も良い。
- `AppTabBar`（`src/features/navigation/components/`）は expo-router 内部型に直接依存せず、
  実際に使うフィールドだけの構造的部分型を自前定義している（[[mobile-developer/expo-router-app-structure]] 参照）。

**既知の残課題（P2/Suggestion 相当、今後の関連PRで再確認すること）:**
- `src/services/auth/index.ts` の real/stub 切替は fail-open（`EXPO_PUBLIC_USE_AUTH_STUB !== "false"` で既定 stub）で、
  `eas.json` の env 変数名（`EXPO_PUBLIC_AUTH_MODE`）と不一致。real 実装が入るまでは実害なしだが、
  real 認証タスクが来たら必ず確認する（詳細は `mobile-security-reviewer/project_auth_stub_switch.md` に既存メモあり）。
- `src/hooks/useToast.ts` は現時点で `features/walk` の2ファイルからしか使われておらず、
  「2機能以上から使うか」の昇格ルール上は features 内に閉じるべきだったのでは、という余地がある
  （Toast 自体は横断的に使われる想定の汎用パターンなので実害は小さい。将来 auth 等でも使われ始めれば正当化される）。
- `MapCanvas` 内の spot ピン Pressable（`WalkStartView` で `size:30/42` のタップ領域）に `hitSlopFor` が
  適用されていない。`pages-components-guideline.md` の44×44ルールは `src/components/ui/*` 追加時の規約として
  書かれているため直接の違反ではないが、実際にタップ操作させる features 側コンポーネントでも同じ原則を
  踏襲するのが望ましい。
