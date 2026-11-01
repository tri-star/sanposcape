import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { removeSanpoMapMember } from "@/features/pin/api/sanpoMapApi";
import {
  PINS_QUERY_ROOT,
  SANPO_MAPS_QUERY_KEY,
  sanpoMapMembersQueryKey,
} from "@/features/pin/lib/pinQueryKeys";
import {
  toSanpoMapMemberRemoveErrorCode,
  type SanpoMapMemberRemoveErrorCode,
} from "@/features/pin/lib/sanpoMapMember";

export type SanpoMapMemberRemoveStatus = "idle" | "removing" | "error";

export type UseSanpoMapMemberRemoveResult = {
  status: SanpoMapMemberRemoveStatus;
  errorCode: SanpoMapMemberRemoveErrorCode | null;
  /** 外す（他人）・抜ける（自分）を実行する。実行中は何もしない。 */
  remove: (userId: string) => void;
  /** 失敗状態を解除する（ダイアログを閉じるときに呼ぶ）。 */
  reset: () => void;
};

/**
 * `DELETE /sanpo-maps/{id}/members/{user_id}`（SS-249）の mutation と、成功時のキャッシュ更新の配線
 * （`usePinDelete` と同じ形）。`leaving` は自分が抜けるかどうか（呼び出し側が判定して渡す）。
 *
 * - 外したとき: メンバーの一覧だけを取り直す。
 * - 抜けたとき: その地図にはもう触れないので、ピンと地図一覧を取り直す（メンバーのキャッシュは残す）。
 */
export function useSanpoMapMemberRemove(
  sanpoMapId: string | null,
  options: { currentUserId: string | null; onRemoved: (input: { leaving: boolean }) => void },
): UseSanpoMapMemberRemoveResult {
  const queryClient = useQueryClient();
  const onRemovedRef = useRef(options.onRemoved);
  onRemovedRef.current = options.onRemoved;
  const currentUserIdRef = useRef(options.currentUserId);
  currentUserIdRef.current = options.currentUserId;
  // 同一フレーム内の連打で DELETE が2本飛ばないよう、同期的に立てるラッチ（破壊的操作なので構造で止める）。
  const submittingRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (userId: string) => {
      await removeSanpoMapMember({ sanpoMapId: sanpoMapId ?? "", userId });
      return { leaving: userId === currentUserIdRef.current };
    },
    onSuccess: ({ leaving }) => {
      if (sanpoMapId === null) return;
      if (leaving) {
        // メンバーのキャッシュは消さない（画面がまだ付いている間に消すと取り直して 404 を踏む）。
        // 抜けた地図は地図一覧から消えるので、画面を離れた後は使われず gcTime で消える。
        // 抜けた地図のピン（ピンタブの地図など）が見えなくなるので取り直す。
        void queryClient.invalidateQueries({ queryKey: PINS_QUERY_ROOT });
      } else {
        void queryClient.invalidateQueries({ queryKey: sanpoMapMembersQueryKey(sanpoMapId) });
      }
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      onRemovedRef.current({ leaving });
    },
    onError: (error) => {
      if (sanpoMapId === null) return;
      // 役割が変わった可能性がある（owner でなくなった等）。役割と一覧を取り直す。
      if (toSanpoMapMemberRemoveErrorCode(error) === "forbidden") {
        void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: sanpoMapMembersQueryKey(sanpoMapId) });
      }
    },
    // 破壊的操作なので自動再試行しない。
    retry: false,
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const { mutate, reset: mutationReset } = mutation;
  const remove = useCallback(
    (userId: string) => {
      if (sanpoMapId === null || submittingRef.current) return;
      submittingRef.current = true;
      mutate(userId);
    },
    [sanpoMapId, mutate],
  );
  const reset = useCallback(() => mutationReset(), [mutationReset]);

  return {
    status: mutation.isPending ? "removing" : mutation.isError ? "error" : "idle",
    errorCode: mutation.isError ? toSanpoMapMemberRemoveErrorCode(mutation.error) : null,
    remove,
    reset,
  };
}
