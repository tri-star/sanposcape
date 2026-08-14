---
name: project_ss37_save_sign_in_cta
description: SS-37（散歩サマリ保存401時のサインインCTA追加）レビュー所見。ADR追補の質・props注入パターン踏襲・状態二重管理無しの参照実装。Critical/Warning無し
type: project
---

SS-37（ブランチ `tri-star/ss-37`、2026-08-15）は `POST /walks` が 401（ゲストのまま保存）で
失敗したときの「真の行き止まり」を解消するタスク。`walk-summary` にサインイン CTA を追加し、
サインイン成功後にサマリ画面へ `dismissTo` で戻して保存を自動再送する。プラン
（`tmp/SS-37/mobile-plan.md`）・実装ともに逸脱なく、Critical/Warning 相当の指摘は無かった
（Suggestion 2件のみ）。

**設計の骨子**:
- `app/walk-summary.tsx` が `useAuthSessionStore` から `isSignedIn`（プリミティブ selector）を読み、
  `WalkSummaryView` → `useWalkSummary` → `useWalkSave` へ props/引数で注入する
  ([[project_ss29_route_as_composition_root]] のパターンの2例目。ADR-009 決定8は不変)。
- `src/features/walk/lib/walkSaveTrigger.ts`（新規）の `nextWalkSaveFireKey` が
  「`clientWalkId:isSignedIn` をキーにした自動発火判定」を純粋関数化。ADR-008 決定4「1回だけ発火」を
  「同じドラフト×同じ認証状態につき1回だけ」に緩和する追補とセットで実装（決定4原文は残し、直後に
  追補を追加する既存の ADR 追補スタイルを踏襲）。
- `walkSaveErrorAction`（`sign_in`|`retry`|`none`。`Record<WalkSaveErrorCode,_>` で網羅性を型保証）を
  `walkSaveError.ts` に追加し、`isRetriableWalkSaveError`（TanStack Query の自動リトライ述語）とは
  意図的に別関数のままにした。「自動リトライ可否」と「UI が何を出すか」が `unauthorized` で食い違う
  ため1関数に畳まなかった判断。
- `getPostSignInDestination` を「遷移先(string)」から「遷移アクション
  (`{type:"replace"|"dismissTo", href}`)」に拡張。優先順は「進行中の散歩(`/(tabs)`) > 保存待ちドラフト
  (`/walk-summary` へ `dismissTo`) > 既定(`/walk-start` へ `replace`)」。サインイン画面への遷移だけ
  `push`（他は `replace` 連鎖）にする例外を追加し、「サインインをやめたら行き止まりに戻れない」を防止。

**検証して裏取りした事実**:
- `node_modules/expo-router/build/global-state/router.d.ts` の `dismissTo` JSDoc
  （「対象が見つからなければ現在画面を `href` で置き換える」）を実機コードで確認。ADR/プランの主張
  （設定画面経由でも破綻しない）と一致。
- `.oxlintrc.json` の `no-restricted-imports` override（`features/walk`/`features/history` のみ対象）は
  変更されていない。`useFinishedWalkStore.ts` も無変更（サインアウト時クリア規律に手を触れていない）。

**ドキュメント品質が高評価だった点**: 過去のレビュー（[[project_ss29_route_as_composition_root]]・
[[project_ss13_auth_session_gate]]・[[project_ss57_guest_route_gate]]）で繰り返し指摘してきた
「設計判断の根拠が `tmp/`（gitignore 対象）にしか残らない」問題が、SS-37 では再発していない。
ADR-008/ADR-009 双方に SS-37 追補が入り、`docs/architecture-guideline.md`「認証の扱い」節にも
`app/walk-summary.tsx` を実例2として追記済み。SS-57 で見つかった「mid-walk 中の設定経由サインイン」
問題（[[project_ss57_guest_route_gate]] 参照）も、`useAuthActions.ts`/`postSignInDestination.ts`
双方に「SS-57 ローカルレビュー対応」として既に解消済みであることをコードで確認した
（`hasActiveWalk` を `hasUnsavedFinishedWalk` より優先する分岐が実装済み）。

**指摘した Suggestion（Critical/Warning無し）**:
1. 優先順「進行中の散歩 > 保存待ちドラフト」により、CTA からサインインしたユーザーが
   `walk-summary` から無言で `/(tabs)` に連れ去られ「保存しました」を見られないケースがある。
   ただし SS-57 由来の既存トレードオフであり SS-37 が新規に作った問題ではない。保存自体は
   `isSignedIn` の変化に反応する自動再送（画面遷移に非依存の「多重防御」設計）で成立するため実害は低い。
2. `.maestro/guest-walk-save-sign-in.yaml` はローカル(WSL2)実行未検証（実装者自身が明記）。
   testID の突き合わせ確認はしたが、CI 初回実行結果までは「検証済み」と扱わないこと
   （[[project_ss21_e2e_finish]] と同種の申し送りパターン）。

**関連メモリ**: [[project_ss29_route_as_composition_root]]（props 注入パターンの初出）、
[[project_ss57_guest_route_gate]]（mid-walk 中サインイン問題の発見と、本レビューで確認した解消）、
[[project_ss19_walk_finish]]（`useWalkSave` 自動発火設計の原型）
