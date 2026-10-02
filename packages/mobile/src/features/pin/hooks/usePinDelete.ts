import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { ApiError } from "@/api/apiError";
import { deletePin } from "@/features/pin/api/pinEditApi";
import { toPinDeleteErrorCode, type PinDeleteErrorCode } from "@/features/pin/lib/pinDeleteError";
import type { PinDeleteStatus } from "@/features/pin/lib/pinDetailState";
import {
  PINS_QUERY_ROOT,
  SANPO_MAPS_QUERY_KEY,
  pinDetailQueryKey,
  pinPhotosQueryKey,
} from "@/features/pin/lib/pinQueryKeys";

export type UsePinDeleteResult = {
  status: PinDeleteStatus;
  errorCode: PinDeleteErrorCode | null;
  /** 削除を実行する。pinId が null / 実行中のときは何もしない。 */
  deletePin: () => void;
  /** 失敗状態を解除する（ダイアログを閉じるときに呼ぶ）。 */
  reset: () => void;
};

/**
 * `DELETE /pins/{id}` の mutation と、成功時のキャッシュ更新の配線（`useWalkDelete` と同じ形）。
 * 判定・整形は書かない（`lib/` に出す。hooks は Vitest 対象外）。
 */
export function usePinDelete(
  pinId: string | null,
  options: { onDeleted: () => void },
): UsePinDeleteResult {
  const queryClient = useQueryClient();
  // 呼び出し側に useCallback を強制しないよう、最新の関数を ref に載せる。
  const onDeletedRef = useRef(options.onDeleted);
  onDeletedRef.current = options.onDeleted;
  // 同一フレーム内の連打で DELETE が2本飛ばないよう、同期的に立てるラッチ（破壊的操作なので構造で止める）。
  const submittingRef = useRef(false);
  // 削除成功を同期的に表すフラグ。onSuccess 内の最初に立てて、後続の状態更新と同じバッチで描画させる。
  // これが無いと、removeQueries 直後・mutation の success 反映前に1回描画され、詳細が取り直されて 404 を踏む。
  const [isDeleted, setIsDeleted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (pinId === null) throw new ApiError(422);
      return deletePin(pinId);
    },
    onSuccess: () => {
      if (pinId === null) return;
      setIsDeleted(true);
      // 順序が仕様: 先に詳細・写真ページを消してから ["pins"] を invalidate する。
      // 逆にすると、消したピンの詳細を取り直して 404 を踏む。
      queryClient.removeQueries({ queryKey: pinDetailQueryKey(pinId), exact: true });
      queryClient.removeQueries({ queryKey: pinPhotosQueryKey(pinId), exact: true });
      // 地図のマーカー・地図詳細のピン一覧・タグ候補。
      void queryClient.invalidateQueries({ queryKey: PINS_QUERY_ROOT });
      // 地図一覧のピン件数（ADR-M-014 の移行事項）。
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      onDeletedRef.current();
    },
    onError: (error) => {
      if (pinId === null) return;
      // 権限が変わった可能性がある（role の変更・作成者でない等）。権限情報と詳細を取り直す。
      if (toPinDeleteErrorCode(error) === "forbidden") {
        void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: pinDetailQueryKey(pinId) });
      }
    },
    // 破壊的操作なので自動再試行しない。失敗はダイアログで見せて手動再試行させる。
    retry: false,
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const { mutate, reset: mutationReset } = mutation;

  const deletePinFn = useCallback(() => {
    if (pinId === null || submittingRef.current) return;
    submittingRef.current = true;
    mutate();
  }, [pinId, mutate]);

  const reset = useCallback(() => {
    mutationReset();
  }, [mutationReset]);

  const status: PinDeleteStatus =
    isDeleted || mutation.isSuccess
      ? "deleted"
      : mutation.isPending
        ? "deleting"
        : mutation.isError
          ? "error"
          : "idle";

  return {
    status,
    errorCode: mutation.isError ? toPinDeleteErrorCode(mutation.error) : null,
    deletePin: deletePinFn,
    reset,
  };
}
