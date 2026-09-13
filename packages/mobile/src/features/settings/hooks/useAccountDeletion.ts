import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import { deleteAccount } from "@/features/settings/api/accountDeleteApi";
import {
  type AccountDeleteErrorCode,
  toAccountDeleteErrorCode,
} from "@/features/settings/lib/accountDeleteError";
import type { AccountDeleteStatus } from "@/features/settings/types";
import { authService } from "@/services/auth";

export type UseAccountDeletionResult = {
  status: AccountDeleteStatus;
  errorCode: AccountDeleteErrorCode | null;
  /** 削除を実行する。実行中の再入は弾く。 */
  deleteAccount: () => void;
  /** 失敗状態を解除する（ダイアログを閉じるときに呼ぶ）。 */
  reset: () => void;
};

/**
 * `DELETE /users/me` の mutation と、成功時のセッション破棄の配線。判定・整形は書かない
 * （hooks は Vitest 対象外。判定は `lib/accountDeleteError.ts` に、文言は `lib/accountDeleteCopy.ts`
 * に出している）。
 *
 * 後始末の順序（成功時）:
 * 1. `DELETE /users/me` → 204。backend 側で `users` 行が消え、`walks`（`walks.user_id` の
 *    `ON DELETE CASCADE` / SS-18）と `refresh_tokens`（`refresh_tokens.user_id` の
 *    `ON DELETE CASCADE`）も同じトランザクションで消える。
 * 2. `authService.signOut()`（既存実装をそのまま再利用。`AuthService` に新メソッドを足さない）。
 *    a. `POST /auth/logout` … 既に存在しない refresh token だが backend の logout は冪等
 *       （未知のトークンでも 204）。失敗しても握りつぶされる。
 *    b. real モードのみ `signOutFromGoogle()`（Google のネイティブセッション破棄）。
 *    c. `tokenStore.clear()` … メモリの access token と SecureStore の refresh token を破棄。
 *    d. `setCurrentUser(null)` → `onSessionChange(null)` → `useAuthSessionStore.setSession(null)`。
 * 3. `useAuthSessionStore.setSession(null)`: status を `authenticated → guest` にし、
 *    その遷移でのみ `runSessionCleanup()` を同期実行する
 *    （`queryClient.clear()` / `useFinishedWalkStore.clearFinishedWalk()` /
 *    `useActiveWalkStore.endWalk()`）。
 * 4. `AuthGate` の effect: `shouldEvacuateOnSessionEnd({ authenticated → guest, !isPublicRoute })`
 *    が true → `router.canDismiss()` なら `dismissAll()` → `router.replace("/(auth)/sign-in")`。
 *    `/settings` は `PUBLIC_ROOT_SEGMENTS` に含まれない保護ルートなので必ず退避する。
 *
 * 順序の要点: トークン破棄（2c）がキャッシュクリア（3）より前に起きるため、
 * クリア直後の再フェッチが有効なトークンで前ユーザーのデータを取り直す窓が無い。
 * 画面側（`SettingsView` / このフック）は `router` を一切触らない。
 *
 * `queryClient.invalidateQueries` / `removeQueries` はここに書かない。`runSessionCleanup()` に
 * 登録済みの `queryClient.clear()`（`src/api/queryClient.ts`）が全キャッシュを捨てるため不要。
 */
export function useAccountDeletion(): UseAccountDeletionResult {
  const mutation = useMutation({
    mutationFn: async () => {
      // 1) アカウント削除（失敗はそのまま throw = mutation は error になる）。
      await deleteAccount();
      // 2) ここから先はローカルのセッション破棄。成功したことは覆らないので失敗を吸収する。
      //    現行実装（real/dev/mock いずれも）の signOut() は内部で全例外を握りつぶすため
      //    reject しないが、将来の実装が reject しても「削除は成功したのに error 表示」に
      //    ならないよう保険をかける（SettingsView のログアウトが同じ理由で catch している）。
      try {
        await authService.signOut();
      } catch {
        // 意図的に握りつぶす。残留した refresh token は次回 refresh で 401 になり自己修復する。
      }
    },
    // 自動再試行はしない（破壊的操作なので、失敗はダイアログで見せて手動再試行させる）。
    retry: false,
  });

  const { mutate, isPending, reset: mutationReset } = mutation;

  const deleteAccountFn = useCallback(() => {
    // 実行中の再入を弾く。ボタンは disabled で塞いであるが、isPending の反映は再レンダーを
    // 挟むため、同一フレーム内の連打では理論上2回 mutate されうる（破壊的操作なので構造で止める）。
    if (isPending) return;
    mutate();
  }, [isPending, mutate]);

  const reset = useCallback(() => {
    mutationReset();
  }, [mutationReset]);

  const status: AccountDeleteStatus = mutation.isPending
    ? "deleting"
    : mutation.isSuccess
      ? "deleted"
      : mutation.isError
        ? "error"
        : "idle";

  return {
    status,
    errorCode: mutation.isError ? toAccountDeleteErrorCode(mutation.error) : null,
    deleteAccount: deleteAccountFn,
    reset,
  };
}
