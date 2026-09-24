---
name: project_ss62_account_delete
description: SS-62（設定画面にアカウント削除の導線）レビュー所見。SS-60/ADR-009パターンの忠実な踏襲は高品質だが、AccountDeleteDialogが成功後(status="deleted")もisDeletingをtrueにせずボタンが再度押せてしまう新規バグを発見
metadata:
  type: project
  scope: task-local
  source_issue: SS-62
---

SS-62（ブランチ `tri-star/SS-62`、2026-09-13）は設定画面にアカウント削除
（`DELETE /users/me`）を追加するタスク。実装計画・申し送りとも精度が高く、SS-60
（`walkDeleteApi.ts`/`WalkDeleteDialog`）・ADR-009（決定2・決定6・SS-57追補）のパターンを
忠実に踏襲している。

**確認して裏取りした主張（すべて一致）**:
- `features/settings/api/accountDeleteApi.ts` の配置根拠（`services/auth/authApi.ts` は
  401→refresh 再帰回避のため意図的に生fetchで、ビジネスAPIを混ぜると3つ目のHTTP出口になる
  というSS-70由来の懸念）は `createSessionAuthService.ts` の実装と整合。
- `useAccountDeletion.ts` の JSDoc が主張する `signOut()` の後始末順序
  （`tokenStore.clear()` → `setCurrentUser(null)` → `onSessionChange` → `setSession(null)` →
  `runSessionCleanup()`（`authenticated→guest`遷移でのみ同期実行）→ `AuthGate`の退避）は
  `createSessionAuthService.ts`/`useAuthSessionStore.ts`/`services/auth/index.ts` の実コードと一致。
  `signOut()` は現行実装（real/dev/mock）で例外を握りつぶし reject しないという主張も
  `createSessionAuthService.signOut()` のtry/catchで確認済み。
- `canDeleteAccount()`（`settingsSection.ts`）による3値（loading/authenticated/guest）分岐、
  `.oxlintrc.json` の `no-restricted-imports` override が `features/settings` を対象外にしている
  非対称性（[[project_ss29_route_as_composition_root]] 由来）、`Button`の`outline`/`danger`
  variantと`dangerTint`トークンが既存であること、すべて実コードで確認済み。新しいHTTP出口・
  新しい色トークンは無い。

**新規に見つけた指摘（Warning）**: `AccountDeleteDialog.tsx` の `isDeleting = status === "deleting"`
は `"deleted"`（削除成功後）を含めていない。`SettingsView.tsx` のコメントは「`isSigningOut` と
同じで意図的にリセットしない」と書いているが、ログアウト側の `isSigningOut` は成功時に
**true のまま**（＝ボタン無効のまま）なのに対し、削除側は成功で `status` が `"deleting"` から
`"deleted"` へ**遷移してしまう**ため `isDeleting` が `false` に戻り、`AuthGate` が
`dismissAll()+replace` するまでの間（JSスケジューリング依存の可変な窓）「削除する」
「キャンセル」ボタンが再度押せる状態になる。この窓で「削除する」を再タップすると、
既に削除済みのアカウントへ2回目の `DELETE /users/me` が飛び 401 → `errorCode="unauthorized"`
→ 「サインインの有効期限が切れました」という**成功直後に矛盾する文言**が出る
（データ損失はないため Critical ではなく Warning）。修正は
`isDeleting = status === "deleting" || status === "deleted"` 相当でログアウト側と対称にする。

**関連メモリ**: [[project_ss60_walk_delete]]（手本にした確認ダイアログ・後始末レジストリ）、
[[project_ss13_auth_session_gate]]（`AuthGate`退避の暗黙のJSスケジューリング依存という同種の
過去の指摘パターン）、[[project_ss29_route_as_composition_root]]（`features/settings`の
oxlint override対象外という非対称性）
