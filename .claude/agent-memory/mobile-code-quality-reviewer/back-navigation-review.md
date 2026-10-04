---
name: back-navigation-review
description: 画面の「戻る」導線（useScreenBack/useNavigateOnce）のレビュー観点。規約の正本は docs/pages-components-guideline.md。ラッチが解除されない異常系と、サインイン導線の push が canGoBack() 前提を崩す落とし穴
metadata:
  type: feedback
  scope: durable
---

規約の正本は `packages/mobile/docs/pages-components-guideline.md` の「画面の『戻る』導線の規約」節。
- 判定ロジック: `src/lib/backNavigation.ts` の `resolveBackAction`（純粋関数。優先順位は
  intercepted > navigating > canGoBack ? pop : replace-fallback）
- フック: `src/hooks/useScreenBack.ts`
- 二重遷移のラッチ: `src/hooks/useNavigateOnce.ts`（`runOnce`。フォーカスで解除する）

ここでは、規約に書かれていないレビュー観点だけを残す。

## 1. 未適用の画面

`SettingsView` は今も `onPress={() => router.back()}` のままで、ハードウェアバックにも、
`canGoBack()` が false のときのフォールバックにも対応していない。次にこの画面を触るときは、
規約に追従させる候補。

## 2. ラッチは「遷移が実際に起きる」前提に立っている

`useNavigateOnce` のラッチは、フォーカスが一度外れて戻ってくることでしか解除されない。
ガードのリダイレクトが失敗するなど、`router.replace`/`back` が blur を起こさない異常系では、
その画面の離脱操作が永久に無反応になる。`experiments.typedRoutes` があるので
`fallbackHref` のタイプミスは型で防げるが、リスクはゼロではない。

**How to apply:** 新しい画面では、戻る操作と「その画面から出る他の遷移」が同じ `runOnce` を
共有しているか確認する。共有していなければ、連打で `push` が二重に積まれうる。

## 3. 保護ルート発のサインイン導線は canGoBack() の不変条件を崩しうる

`useAuthActions.ts` は「`/walk-start` に到達した時点で `canGoBack() === false`」を前提にしており、
`WalkStartView` の `useScreenBack({ fallbackHref })` はこの前提の上に成り立つ。SS-57 で
`SettingsView` のゲスト向け「サインイン」ボタンが `router.push("/(auth)/sign-in")` だったため、
`settings` がスタックに残り、この前提が崩れていた（現在は `router.replace` に修正済み）。
`.maestro/auth-gate.yaml` は画面の可視性しか確認しておらず、テストでは検出できなかった。

**How to apply:** 認証まわり（`AuthGate`/`useAuthActions`/各画面のサインイン導線）では、
「サインイン画面へ push と replace のどちらで入ったか」と「成功後の遷移」を突き合わせる。
`canGoBack()` に依存する画面と矛盾しないか確かめ、新しい導線には `router.replace` への統一か、
`router.canDismiss()` → `dismissAll()`（`AuthGate` の退避と同じ形）を提案する。
push/replace の追跡手順は [[maestro-e2e-review-approach]] を参照。
