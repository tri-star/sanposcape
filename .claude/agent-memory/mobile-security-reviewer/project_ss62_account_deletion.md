---
name: project_ss62_account_deletion
description: SS-62（設定画面のアカウント削除導線）レビュー要点。DELETE /users/me → signOut() → runSessionCleanup の順序と、破壊的操作の二重実行防止パターン
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md
---

SS-62（`tri-star/SS-62`、2026-09-13 レビュー）で `DELETE /users/me` によるアカウント削除を実装。
Critical/High 指摘なし。この機能は「破壊的・不可逆な自己完結型操作（パスパラメータなし、常に
`Bearer token` が指す本人が対象）」の模範実装として今後の同種レビュー（アカウント関連の破壊的操作）
の参照点になる。

**確認できた安全設計**:
- 削除は確認ダイアログ経由必須。`Dialog` の `dismissDisabled`（scrim tap / X ボタン / Android 戻る
  操作をすべて無効化）と `Button` の `disabled`（RN `Pressable.disabled` で onPress 自体が発火しない）
  を `status === "deleting"` で連動させており、削除実行中はダイアログを閉じる手段が無い
  （`AccountDeleteDialog.tsx` / `Dialog.tsx` / `Button.tsx` で確認）。
- 二重実行防止は `useAccountDeletion.ts` の `if (isPending) return;` ガード。理論上「同一フレームの
  連打」で `isPending` の反映（次の再レンダー）前に2回 `mutate()` が呼ばれる可能性は実装者コメントも
  認めている残余リスクだが、対象リソースが常に「トークンが指す本人」でパラメータを持たないため、
  2回目の DELETE は（1回目が成功していれば）バックエンド側で本人解決に失敗し 401 になるだけで
  実害は生まない（決済等の非冪等操作と異なり、同一リソースへの重複破壊操作は安全側に倒れる）。
- 順序: `deleteAccount()`（204 or throw）→ `authService.signOut()`
  → `tokenStore.clear()`（トークン破棄）→ `setCurrentUser(null)` → `onSessionChange` →
  `useAuthSessionStore.setSession(null)` → `runSessionCleanup()`（`queryClient.clear()` /
  `useActiveWalkStore.endWalk()` / `useFinishedWalkStore.clearFinishedWalk()`、いずれも
  `registerSessionCleanup()` 経由で登録済み）→ `AuthGate` が退避。**トークン破棄がキャッシュ
  クリアより前**に起きる順序をコードで確認済み（[[project_ss19_walk_finish_save]] で指摘した
  「signOut 時に一部 store が未クリア」というギャップは、その後 `registerSessionCleanup` の
  仕組みが導入されたことで解消済み。SS-57 時点で気づかれていたが本レビューで再確認）。
- 401（削除できていない状態）は「非再試行」に倒し、ローカルを掃除して成功に見せない
  （`canRetryAccountDelete` が `unauthorized` を除外）。実際に到達しうる 401 経路
  （refresh token 失効）では `doRefresh()` の unauthorized 節が自律的にセッションを破棄するため
  矛盾は生じない（[[project_ss10_token_clear_exception_safety]] の fail-safe 修正が前提）。
  `canDeleteAccount()` は `authenticated` でのみ true（`loading`/`guest` は false）。
- HTTP 出口: `deleteMeUsersMeDelete()`（Orval生成）→ `customFetch`（`src/api/client.ts`）経由のみ。
  生 fetch による3つ目の出口は作られていない（[[project_ss70_cloudfront_auth_header]] の
  懸念=Backlog SS-76 を再生産していないことを確認）。
- エラーメッセージは固定文言（`accountDeleteError.ts` の `MESSAGES` マップ）でサーバーレスポンス
  本文を画面に出さない。ログ出力（`console.*`）にトークン・ユーザー識別子の混入なし。
  `SettingsView` は `useAuthSessionStore` から `status` のみ購読し `user`（PII）は読まない
  （SS-57 と同じ規律）。

**Why**: この repo では破壊的操作（散歩削除=SS-60、ログアウト、アカウント削除=SS-62）が同じ
「確認ダイアログ + lib層の純粋関数で判定 + hooks で TanStack Query mutation」パターンに
収斂している。今後このパターンから外れる実装（例: 確認なしの即時実行、生 fetch の追加、
ローカル成功扱いへの読み替え）が出たら要 Critical/High 疑い。

**How to apply**: 今後 mobile でアカウント関連の破壊的操作（退会以外の不可逆操作等）が追加される
PR では、(1) 確認ダイアログの dismiss/disabled が実行中に確実に効くか、(2) トークン破棄がキャッシュ
クリアより前か、(3) 401 を成功に読み替えていないか、(4) `customFetch` 以外の HTTP 出口を新設して
いないか、の4点をこのメモリのチェックリストとして再利用する。

関連: [[project_ss10_token_clear_exception_safety]]、[[project_ss19_walk_finish_save]]、
[[project_ss57_guest_walk_start]]、[[project_ss70_cloudfront_auth_header]]
