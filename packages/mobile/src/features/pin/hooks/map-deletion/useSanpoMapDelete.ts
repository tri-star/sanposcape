import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { ApiError } from "@/api/apiError";
import { deleteSanpoMap } from "@/features/pin/api/sanpoMapApi";
import {
  toSanpoMapDeleteErrorCode,
  type SanpoMapDeleteErrorCode,
  type SanpoMapDeleteStatus,
} from "@/features/pin/lib/map-deletion/sanpoMapDelete";
import { PINS_QUERY_ROOT, SANPO_MAPS_QUERY_KEY } from "@/features/pin/lib/pinQueryKeys";

export type UseSanpoMapDeleteResult = {
  status: SanpoMapDeleteStatus;
  errorCode: SanpoMapDeleteErrorCode | null;
  /** 削除を実行する。sanpoMapId が null / 実行中のときは何もしない。 */
  deleteMap: () => void;
  /** 失敗状態を解除する（ダイアログを閉じるときに呼ぶ）。 */
  reset: () => void;
};

/**
 * `DELETE /sanpo-maps/{id}`（SS-265）の mutation と、成功時のキャッシュ更新の配線（`usePinDelete` と同じ形）。
 * 判定・整形は書かない（`lib/map-deletion/` に出す。hooks は Vitest 対象外）。
 *
 * 成功したら status は同期的に "deleted" になる。呼び出し側（地図詳細）はこれを見て、消した地図の
 * ピン一覧・メンバーの取得を止め（enabled=false）、本文を差し替える。止めないと、下の invalidate で
 * 消した地図を取り直して 404 を踏み、画面を離れるまでの間にエラーや not-found が一瞬出る。
 */
export function useSanpoMapDelete(
  sanpoMapId: string | null,
  options: { onDeleted: () => void },
): UseSanpoMapDeleteResult {
  const queryClient = useQueryClient();
  // 呼び出し側に useCallback を強制しないよう、最新の関数を ref に載せる。
  const onDeletedRef = useRef(options.onDeleted);
  onDeletedRef.current = options.onDeleted;
  // 同一フレーム内の連打で DELETE が2本飛ばないよう、同期的に立てるラッチ（破壊的操作なので構造で止める）。
  const submittingRef = useRef(false);
  // onSuccess の最初に立て、後続の invalidate と同じバッチで描画させる（usePinDelete と同じ理由）。
  const [isDeleted, setIsDeleted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (sanpoMapId === null) throw new ApiError(422);
      return deleteSanpoMap(sanpoMapId);
    },
    onSuccess: () => {
      setIsDeleted(true);
      // 地図のピン（ピンタブ・散歩中の地図のマーカー・地図詳細の一覧・タグ候補）と地図一覧（地図が消える。
      // 既定地図を消したら繰り上がった地図の「既定」も変わる。ADR-009 決定28）。
      // 消した地図のピン一覧・メンバーは呼び出し側が取得を止めるので取り直されず、画面を離れた後に gcTime で消える。
      void queryClient.invalidateQueries({ queryKey: PINS_QUERY_ROOT });
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      onDeletedRef.current();
    },
    onError: (error) => {
      // 役割が変わった可能性がある（owner でなくなった等）。役割を取り直してボタンを消す。
      if (toSanpoMapDeleteErrorCode(error) === "forbidden") {
        void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      }
    },
    // 破壊的操作なので自動再試行しない。失敗はダイアログで見せて手動再試行させる。
    retry: false,
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const { mutate, reset: mutationReset } = mutation;

  const deleteMap = useCallback(() => {
    if (sanpoMapId === null || submittingRef.current) return;
    submittingRef.current = true;
    mutate();
  }, [sanpoMapId, mutate]);

  const reset = useCallback(() => {
    mutationReset();
  }, [mutationReset]);

  const status: SanpoMapDeleteStatus =
    isDeleted || mutation.isSuccess
      ? "deleted"
      : mutation.isPending
        ? "deleting"
        : mutation.isError
          ? "error"
          : "idle";

  return {
    status,
    errorCode: mutation.isError ? toSanpoMapDeleteErrorCode(mutation.error) : null,
    deleteMap,
    reset,
  };
}
