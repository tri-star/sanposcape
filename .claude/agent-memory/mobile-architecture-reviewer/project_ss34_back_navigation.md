---
name: project_ss34_back_navigation
description: SS-34（散歩開始前に探索・記録へ戻れる導線を追加）レビュー時点の実装状況と確認済みの設計整合ポイント
type: project
---

ブランチ `feat/ss-34-walk-start-back-navigation`（2026-08-05 時点でレビュー。gitStatus のスナップショットは
`feat/ss-21-mvp-e2e` のままだったが、実際のワーキングツリーは SS-34 のファイルで最新化されていた
— [[project_ss16_walk_route]] と同様の既知の環境挙動、Bash 不可のため git diff は使えず
Glob/Grep/Read で直接検証）。

`src/lib/backNavigation.ts`（純粋関数 `resolveBackAction`）+ `src/hooks/useScreenBack.ts`
（`useFocusEffect` + `BackHandler` + `useRef` ラッチ）を新設し、`WalkStartView`（新規に戻るボタン追加）・
`WalkHistoryListView`・`WalkDetailView`（重複していた手書き `handleBack` を集約）に適用。
`docs/pages-components-guideline.md` に「画面の『戻る』導線の規約」節を追記。

**確認できた良好パターン（今後のレビューでも踏襲を期待してよい）:**
- `resolveBackAction`（`intercepted > navigating > canGoBack ? pop : replace-fallback` の優先順位）が
  `react-native`/`expo-router` 非依存の純粋関数として `src/lib/` に切り出され、8パターン全網羅の
  `.test.ts` で優先順位そのものをテスト対象にしている。`useScreenBack.ts` 自体は RN 依存のため
  `.test.ts` を作らない、という `architecture-guideline.md` の方針とも整合。
- `useScreenBack` は `features/walk` と `features/history` の2機能から使われるため
  `src/hooks/`（`useToast.ts` と同列）に置く判断が folder-structure.md の昇格ルールと一致している。
- `interceptRef`/`fallbackRef` を使い、BackHandler 購読を毎レンダー貼り直さない設計は
  `useWalkTracking.ts` の `pausedRef` と同じ手法を踏襲（コードコメントで明示）。
- `WalkStartView.handleStartWalk` は `back.runOnce` でラッチを共有し、戻る連打・戻る＋開始の同時押しで
  二重遷移が起きない。ADR-008 の `useActiveWalkStore.startWalk` 呼び出し自体は変更していない。
- 新規 Maestro フロー（`walk-start-back.yaml`/`walk-history.yaml`）はタグ運用・
  `maps-required` 回避のディープリンク手法（`walk-history.yaml` が `/explore/places` に依存しないよう
  `openLink` で直接遷移）を含め、既存の ADR-004 方針・SS-21 の手法と整合している。
- 新規/変更ファイルの命名（`backNavigation.ts`/`useScreenBack.ts`、フォルダはすべて既存の
  kebab-case フォルダ）は naming-conventions.md に完全準拠。import の case 一致も確認済み。

**残課題（要フォロー）:**
- 🟡 `src/features/settings/components/SettingsView.tsx` の戻るボタンは今回のPRで移行されず、
  `onPress={() => router.back()}` のまま（`useScreenBack` 未使用、Android システムバックの
  ハンドリングもなし）。新設された「画面上の戻る/キャンセルと Android のシステムバックは
  `useScreenBack` に一本化する」という規約（`pages-components-guideline.md`）と実装が食い違っている。
  現状 Settings は常に `WalkActiveView` から `push` で開かれるため `canGoBack()` は実質常に true で
  実害は顕在化していないが、将来の新しい遷移元（ディープリンク等）で `router.back()` が no-op になり
  ユーザーが詰む余地がある。次に Settings 系画面を触るときに移行漏れとして再指摘する。
- 🔵 このスクリーン戻る導線の一本化は、優先順位ロジック・`predictiveBackGestureEnabled: false` への
  依存など、他の cross-cutting な設計判断（ADR-006/ADR-008）と同程度に「なぜ」を残す価値がある内容だが、
  ADR ではなく `pages-components-guideline.md`（実装ガイドライン）にのみ記載されている。今後 Android の
  predictive back 対応などで見直しが入るなら、その時点で ADR 化を検討してよい。
