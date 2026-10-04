import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { updateSanpoMapIcon } from "@/features/pin/api/sanpoMapApi";
import { SANPO_MAPS_QUERY_KEY } from "@/features/pin/lib/pinQueryKeys";
import { replaceUpdatedSanpoMap } from "@/features/pin/lib/sanpoMapCache";
import {
  toSanpoMapUpdateErrorCode,
  type SanpoMapUpdateErrorCode,
} from "@/features/pin/lib/sanpoMapError";
import type { SanpoMapIconKey } from "@/features/pin/types";
import type { SanpoMap } from "@/features/pin/types";

export type UseSanpoMapIconUpdateResult = {
  /** 変更中の再呼び出しは無視する。 */
  update: (input: { sanpoMapId: string; icon: SanpoMapIconKey }) => void;
  isUpdating: boolean;
  errorCode: SanpoMapUpdateErrorCode | null;
  reset: () => void;
};

/**
 * アイコン変更（`PATCH /sanpo-maps/{id}`）の mutation と、成功時のキャッシュ反映（SS-171）。
 *
 * - 成功時は一覧キャッシュの1件を置き換え + invalidate。ピンのクエリ（`["pins", …]`）は
 *   invalidate しない（ピンのアイコンは地図一覧から引くので、一覧の更新だけでマーカーが付け直される）。
 * - 失敗時も一覧を取り直す（404 なら一覧から消え、応答が届かなかった場合もサーバーの値に揃う）。
 */
export function useSanpoMapIconUpdate(options: {
  onUpdated: (map: SanpoMap) => void;
}): UseSanpoMapIconUpdateResult {
  const queryClient = useQueryClient();
  const onUpdatedRef = useRef(options.onUpdated);
  onUpdatedRef.current = options.onUpdated;
  // 連打で二重の成功通知・invalidate が起きないよう、同期的に立てるラッチ。
  const submittingRef = useRef(false);

  const mutation = useMutation({
    mutationFn: updateSanpoMapIcon,
    retry: false,
    onSuccess: (map) => {
      queryClient.setQueryData<SanpoMap[]>(SANPO_MAPS_QUERY_KEY, (old) =>
        replaceUpdatedSanpoMap(old, map),
      );
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      onUpdatedRef.current(map);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const { mutate, reset, isPending } = mutation;
  const update = useCallback(
    (input: { sanpoMapId: string; icon: SanpoMapIconKey }) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      mutate(input);
    },
    [mutate],
  );

  return {
    update,
    isUpdating: isPending,
    errorCode: mutation.error ? toSanpoMapUpdateErrorCode(mutation.error) : null,
    reset,
  };
}
