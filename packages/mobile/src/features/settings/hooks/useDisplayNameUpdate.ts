import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import { updateDisplayName } from "@/features/settings/api/displayNameApi";
import {
  type DisplayNameUpdateErrorCode,
  toDisplayNameUpdateErrorCode,
} from "@/features/settings/lib/displayName";
import { authService } from "@/services/auth";

export type UseDisplayNameUpdateResult = {
  isSaving: boolean;
  errorCode: DisplayNameUpdateErrorCode | null;
  /** 保存する（検証済み・trim 済みの名前を渡す）。保存中の再入は弾く。 */
  save: (displayName: string) => void;
  /** 失敗状態を解除する（入力を変えたとき・ダイアログを閉じるときに呼ぶ）。 */
  reset: () => void;
};

/**
 * `PATCH /users/me` の mutation と、成功時の認証セッションの差し替えの配線（SS-268）。
 * 判定・文言は `lib/displayName.ts` に置く（hooks は Vitest 対象外）。
 *
 * 成功したら `authService.updateCurrentUser()` で `useAuthSessionStore` の `user` を差し替える。
 * ストアへ直接書かず、サービスの `onSessionChange` を通す（ADR-M-009 の書き込み経路を増やさない）。
 * アカウントタブの挨拶はストアを読むのですぐ変わる。地図のメンバー一覧のキャッシュ（features/pin）は
 * feature をまたぐ import を作らないため触らず、鮮度切れ・引っ張って更新で取り直す。
 * 自動再試行はしない（失敗はダイアログで見せる）。
 */
export function useDisplayNameUpdate(options: { onSaved: () => void }): UseDisplayNameUpdateResult {
  const { onSaved } = options;
  const mutation = useMutation({
    mutationFn: updateDisplayName,
    onSuccess: (user) => {
      authService.updateCurrentUser(user);
      onSaved();
    },
    retry: false,
  });
  const { mutate, isPending, reset: mutationReset } = mutation;

  const save = useCallback(
    (displayName: string) => {
      // isPending の反映は再レンダーを挟むので、同じフレームの連打をここでも止める。
      if (isPending) return;
      mutate(displayName);
    },
    [isPending, mutate],
  );

  const reset = useCallback(() => {
    mutationReset();
  }, [mutationReset]);

  return {
    isSaving: isPending,
    errorCode: mutation.isError ? toDisplayNameUpdateErrorCode(mutation.error) : null,
    save,
    reset,
  };
}
