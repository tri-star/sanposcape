---
name: post-sign-in-destination-action
description: サインイン成功後の遷移先を決めるgetPostSignInDestinationは「遷移アクション(replace/dismissTo + href)」を返す。SS-37でCTA戻り先を追加する際の型に注意。
metadata:
  type: project
---

`packages/mobile/src/features/auth/lib/postSignInDestination.ts` の
`getPostSignInDestination()` は SS-57 ローカルレビュー対応時点では
`"/walk-start" | "/(tabs)"` という文字列を返すだけだったが、SS-37 で
「遷移アクション」を返す判別共用体に拡張した。

```typescript
export type PostSignInDestination =
  | { type: "replace"; href: "/walk-start" | "/(tabs)" }
  | { type: "dismissTo"; href: "/walk-summary" };

export type PostSignInInput = {
  hasActiveWalk: boolean;
  hasUnsavedFinishedWalk: boolean;
};
```

呼び出し側（`useAuthActions.runSignIn`）は `destination.type` で
`router.replace` / `router.dismissTo` を分岐する。

## 優先順位（変更時は必ずこの順を維持する）

1. `hasActiveWalk` → `/(tabs)`（`WalkActiveView` を隠さない。SS-57 ローカルレビュー対応）
2. `hasUnsavedFinishedWalk` → `/walk-summary` へ `dismissTo`（SS-37）
3. どちらも無し → `/walk-start` へ `replace`（既定）

進行中の散歩を保存待ちドラフトより優先するのは「散歩の最中に別画面へ連れて行かない」ため。
両方立つのは稀なケース（保存待ちのまま次の散歩を始めた）。

## なぜ `dismissTo` で、`replace` ではないか

CTA（例: `walk-summary-save-sign-in`）はサインイン画面へ `push` で遷移する
（[[auth-session-gate-pattern]] の「原則replace連鎖」に対する意図的な例外。
`replace`だと戻れず新しい行き止まりを作るため）。戻り先を `replace` にすると、
`push` で積んだサマリ画面の**上にもう一枚サマリが積まれる**。`dismissTo` は
スタックに対象があればそこまで pop、無ければ現在画面を置き換えるので、
CTA 経由でも設定画面経由でも破綻しない。

## 拡張する際の注意

- `PostSignInInput` はオブジェクトにする（boolean位置引数の取り違え事故を防ぐ）。
- 新しい遷移先を足すときは、必ず「進行中の散歩を隠さない」という既存の最優先条件を
  壊さないこと（テストで4象限すべて固定している。`postSignInDestination.test.ts`）。
- 保存の再送自体はこの遷移に依存しない（多重防御）。`authService.signIn()` 内で
  `setSession(user)` が走った時点でサマリ画面（スタック下でmount済み）の`isSignedIn`が
  変わり、`useWalkSave`の自動発火effect（`nextWalkSaveFireKey`）が反応する。遷移が失敗しても
  保存自体は走る設計にしてある。
