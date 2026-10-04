import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { createSanpoMap } from "@/features/pin/api/sanpoMapApi";
import { SANPO_MAPS_QUERY_KEY } from "@/features/pin/lib/pinQueryKeys";
import { insertCreatedSanpoMap } from "@/features/pin/lib/sanpoMapCache";
import {
  toSanpoMapCreateErrorCode,
  type SanpoMapCreateErrorCode,
} from "@/features/pin/lib/sanpoMapError";
import type { SanpoMapIconKey } from "@/features/pin/types";
import type { SanpoMap } from "@/features/pin/types";

export type UseSanpoMapCreateResult = {
  /** `validateSanpoMapName` を通した name と、選んだアイコンを渡す。作成中の再呼び出しは無視する。 */
  create: (input: { name: string; icon: SanpoMapIconKey }) => void;
  isCreating: boolean;
  errorCode: SanpoMapCreateErrorCode | null;
  /** エラー表示を消す（入力を変えたとき・ダイアログを開き直したとき）。 */
  reset: () => void;
};

/**
 * `POST /sanpo-maps` の mutation と、成功時のキャッシュ反映（SS-121。SS-117 のピン登録画面からも使う）。
 *
 * - `retry: false`: 冪等キーが無いので、応答が届かなかっただけの再送で同じ地図が2つできる。
 * - 成功時は一覧キャッシュへ即時挿入 + invalidate（サーバーの並び・他端末の変更を取り込む）。
 * - 失敗時も一覧を取り直す（通信断でもサーバー側では作れている可能性があるため）。
 */
export function useSanpoMapCreate(options: {
  onCreated: (map: SanpoMap) => void;
}): UseSanpoMapCreateResult {
  const queryClient = useQueryClient();
  // 最新の onCreated を呼ぶ（呼び出し側が useCallback しなくても壊れない。useScreenBack と同じ手法）。
  const onCreatedRef = useRef(options.onCreated);
  onCreatedRef.current = options.onCreated;
  // 再レンダー前に続けて呼ばれても POST が2本飛ばないよう、同期的に立てるラッチ
  // （`isPending` はレンダーのクロージャなので同一フレーム内の連打を防げない）。
  const submittingRef = useRef(false);

  const mutation = useMutation({
    mutationFn: (input: { name: string; icon: SanpoMapIconKey }) => createSanpoMap(input),
    retry: false,
    onSuccess: (map) => {
      queryClient.setQueryData<SanpoMap[]>(SANPO_MAPS_QUERY_KEY, (old) =>
        insertCreatedSanpoMap(old, map),
      );
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      onCreatedRef.current(map);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const { mutate, reset, isPending } = mutation;
  const create = useCallback(
    (input: { name: string; icon: SanpoMapIconKey }) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      mutate(input);
    },
    [mutate],
  );

  return {
    create,
    isCreating: isPending,
    errorCode: mutation.error ? toSanpoMapCreateErrorCode(mutation.error) : null,
    reset,
  };
}
