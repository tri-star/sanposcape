---
name: mutation-success-state-not-treated-as-busy
description: useMutation由来のstatus計算で「isPending」だけをdisabled判定に使うと、成功直後だが外部エフェクト（AuthGate等）の遷移待ちの間だけ操作可能に戻ってしまうことがある
metadata:
  type: feedback
  scope: durable
---

SS-62（`packages/mobile/src/features/settings/hooks/useAccountDeletion.ts` /
`packages/mobile/src/features/settings/components/AccountDeleteDialog.tsx`）で発見。

`useWalkDelete.ts` を手本にした `status` 計算パターン:

```ts
const status = mutation.isPending ? "deleting" : mutation.isSuccess ? "deleted" : ...
```

ダイアログ側は `isDeleting = status === "deleting"` だけをボタンの `disabled` / ダイアログの
`dismissDisabled` に使う。`isPending` は mutation が **settle した瞬間**（`isSuccess` に切り替わると
同時）に `false` になるため、`status === "deleted"` の間はボタンが**通常の操作可能な見た目に戻る**。

- `useWalkDelete` の呼び出し元（`WalkDetailView`）は `onSuccess` 内で同期的に `onDeleted()`
  （画面遷移）を呼ぶため、この「deleted だが disabled ではない」窓は実質1フレーム未満で問題にならない。
- `useAccountDeletion` は違う: 成功後の遷移は `authService.signOut()` →
  `onSessionChange(null)` → `useAuthSessionStore.setSession(null)` → `AuthGate` の
  `useEffect` という**複数レンダーを挟む非同期チェーン**に依存する（ADR-009 決定6）。
  この間 `AccountDeleteDialog` は「削除する」「キャンセル」ボタンが押せる見た目のまま残り、
  ユーザーが再度「削除する」を押すと（アカウントは既に削除済み・トークンも破棄されているため）
  2回目の呼び出しが 401 になり、削除成功直後に「サインインの有効期限が切れました」という
  紛らわしいエラー表示が一瞬出うる。

`SettingsView.tsx` のコメントは「`isSigningOut` と同じで意図的にリセットしない」と書いているが、
実際は非対称: ログアウトの `isSigningOut` は成功時に `false` へ戻すコードが無い（catch でのみ
`false` に戻す）ため成功後もボタンは disabled のまま保たれるのに対し、アカウント削除の
`isDeleting` は mutation の settle と同時に `false` に戻ってしまう。

**Why:** `useMutation` の `isPending` は「処理中」であって「操作を許可してよいか」ではない。
成功後に外部の非同期プロセス（別ストアの購読・別コンポーネントの effect）が遷移を担う設計では、
「busy」を `isPending` 単体ではなく `isPending || isSuccess`（またはこの hook が管理する
明示的な `isBusy` ステート）で表現しないと、成功直後の一瞬だけ UI が「何も起きていないかのように」
操作可能に戻ってしまう。

**How to apply:** 削除・退会等の破壊的操作 hook をレビューするとき、「成功後の画面遷移が
同期コールバック（呼び出し元がその場で行う）か、非同期チェーン（他ストア→他コンポーネントの
effect）か」を必ず確認する。非同期チェーンの場合、ダイアログの `disabled` 判定が
`status === "deleting"` だけでなく `status === "deleted"`（または相当する成功状態）も
busy 扱いにしているか確認し、なっていなければ Warning として指摘する。
