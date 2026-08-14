---
name: ss57-guest-settings-signin-push-breaks-canGoBack-invariant
description: SettingsView の「サインイン」導線が router.push で /(auth)/sign-in を開くと、ゲスト→認証成功後の walk-start で canGoBack()===false という設計不変条件が崩れる（SS-57で発見）
metadata:
  type: project
---

`packages/mobile/src/features/auth/hooks/useAuthActions.ts` の `continueAsGuest` の実装コメントは
「スプラッシュ→サインイン→walk-start は replace 連鎖で、/walk-start 到達時に canGoBack() === false
になる設計」と明言している。この不変条件は `WalkStartView` が `useScreenBack({ fallbackHref: HOME_HREF })`
で「戻れないときは HOME_HREF へ replace」という前提の土台になっている。

SS-57 で `SettingsView`（`src/features/settings/components/SettingsView.tsx`）にゲスト向け
「サインイン」ボタン（`settings-sign-in`）が追加されたが、これは `router.push("/(auth)/sign-in")`
を使っている。ゲストが `/settings`（保護ルート、SS-57 でゲストも到達可能になった）からこのボタンで
サインインすると、スタックは `[..., settings, sign-in]` になり、サインイン成功時の
`useAuthActions.signInWithGoogle` は `router.replace("/walk-start")`（dismissAll は伴わない）
しか呼ばないため、`settings` がスタックに残ったまま `walk-start` に到達する＝
`canGoBack() === true` になり、上記の設計不変条件が崩れる。

**Why:** ゲストが探索後にアプリ内でサインインする唯一の導線が Settings 経由になったため
（スプラッシュ経由の初回サインインより頻度が高くなり得る）、この経路は edge case ではなく
主要な「ゲスト→本登録」導線になっている。壊れても即クラッシュ/データ損失ではないが、
`walk-start` 画面上の戻る操作（UI ボタン・Android システムバック）が「タブホームへフォールバック」
ではなく「Settings へ pop」という、設計コメントと食い違う挙動になる。`.maestro/auth-gate.yaml`
はこの経路で `walk-start-screen` の可視性しか確認しておらず、`.maestro/walk-start-back.yaml`
は `subflows/sign-in.yaml`（スプラッシュ発の正規フロー）の後にしか戻る挙動を検証していないため、
この食い違いはテストでも検出されない。

**How to apply:** 認証まわり（`AuthGate` / `useAuthActions` / 各画面のサインイン導線）をレビューする
ときは、「サインイン画面へどう入ったか（push か replace か、どのスタックの上に乗ったか）」と
「サインイン成功後の遷移（`router.replace("/walk-start")`）」を必ず突き合わせ、
`canGoBack()` に依存する画面（`useScreenBack` の `fallbackHref` を持つ画面）に矛盾が生じないかを
確認する。新しいサインイン導線（保護ルートから開くもの）を見つけたら、
`router.replace` に統一するか、遷移前に `router.canDismiss()` を確認して `dismissAll()` する
（`AuthGate` の退避ロジックと同じパターン）ことを提案するとよい。
[[maestro-e2e-review-approach]] の手順（yaml の主張を push/replace 実装まで追跡する）がこの発見の
決め手になった。
