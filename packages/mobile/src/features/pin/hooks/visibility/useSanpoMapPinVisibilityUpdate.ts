import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { updateSanpoMapPinsVisible } from "@/features/pin/api/sanpoMapApi";
import { SANPO_MAPS_QUERY_KEY } from "@/features/pin/lib/pinQueryKeys";
import { replaceUpdatedSanpoMap } from "@/features/pin/lib/sanpoMapCache";
import {
  toSanpoMapUpdateErrorCode,
  type SanpoMapUpdateErrorCode,
} from "@/features/pin/lib/sanpoMapError";
import { setSanpoMapPinsVisible } from "@/features/pin/lib/visibility/sanpoMapPinVisibility";
import type { SanpoMap } from "@/features/pin/types";

type PinsVisibleInput = { sanpoMapId: string; pinsVisible: boolean };

export type UseSanpoMapPinVisibilityUpdateResult = {
  /** 同じ地図の切り替え中の再呼び出しは無視する（別の地図は同時に切り替えられる）。 */
  update: (input: PinsVisibleInput) => void;
  /** 切り替え中の地図の ID（そのスイッチを無効にする）。 */
  pendingSanpoMapIds: ReadonlySet<string>;
  /** 直近の失敗の分類。次の切り替えを始めると消える。 */
  errorCode: SanpoMapUpdateErrorCode | null;
};

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** 切り替え中の地図の ID（アプリ全体で1つ。上の JSDoc を参照）。 */
const pendingSanpoMapIdsInFlight = new Set<string>();

/**
 * 地図のピンの表示・非表示（`PATCH /sanpo-maps/{id}/members/me`。SS-266）の mutation。
 *
 * - 押した瞬間に地図一覧のキャッシュ（`SANPO_MAPS_QUERY_KEY`）の `pinsVisible` を書き換える（楽観的な更新）。
 *   `useRegisteredPins` はこの一覧から取りに行く地図を選ぶので、ピンタブ・散歩中の地図にその場で効く。
 * - 成功したら応答で1件を置き換える。一覧の取り直しはしない（ほかの地図の切り替え中に古い値で上書きしないため）。
 * - 失敗したら、その地図の値だけを押す前に戻し、一覧を取り直してサーバーの値に揃える（404 なら一覧から消える）。
 *   スナップショットで丸ごと戻さないのは、同時に切り替えたほかの地図の値まで戻さないため。
 * - 同じ地図の切り替えは、終わるまで受け付けない（送った順と届く順が入れ替わって、最後の操作と違う値が残るのを防ぐ）。
 *   ラッチはモジュールのスコープに1つだけ持つ。シートはピンタブとナビタブの両方に置かれ、タブを切り替えても
 *   両方マウントされたままになるため、インスタンスごとに持つと別のタブから同じ地図の要求が同時に出る。
 *   スイッチの無効表示（`pendingSanpoMapIds`）は、その画面で始めた切り替えだけを映す。
 */
export function useSanpoMapPinVisibilityUpdate(): UseSanpoMapPinVisibilityUpdateResult {
  const queryClient = useQueryClient();
  // この画面で始めた切り替え（表示用）。要求を止めるラッチは `pendingSanpoMapIdsInFlight`。
  const pendingRef = useRef(new Set<string>());
  const [pendingSanpoMapIds, setPendingSanpoMapIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [errorCode, setErrorCode] = useState<SanpoMapUpdateErrorCode | null>(null);

  const syncPending = useCallback(() => {
    setPendingSanpoMapIds(pendingRef.current.size === 0 ? EMPTY_IDS : new Set(pendingRef.current));
  }, []);

  const { mutate } = useMutation({
    mutationFn: updateSanpoMapPinsVisible,
    retry: false,
    onMutate: async (input: PinsVisibleInput) => {
      // 取得中の一覧が楽観的な値を古い値で上書きしないように止める。
      await queryClient.cancelQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      queryClient.setQueryData<SanpoMap[]>(SANPO_MAPS_QUERY_KEY, (old) =>
        setSanpoMapPinsVisible(old, input.sanpoMapId, input.pinsVisible),
      );
    },
    onSuccess: (map) => {
      queryClient.setQueryData<SanpoMap[]>(SANPO_MAPS_QUERY_KEY, (old) =>
        replaceUpdatedSanpoMap(old, map),
      );
    },
    onError: (error, input) => {
      queryClient.setQueryData<SanpoMap[]>(SANPO_MAPS_QUERY_KEY, (old) =>
        setSanpoMapPinsVisible(old, input.sanpoMapId, !input.pinsVisible),
      );
      setErrorCode(toSanpoMapUpdateErrorCode(error));
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
    },
    onSettled: (_data, _error, input) => {
      pendingSanpoMapIdsInFlight.delete(input.sanpoMapId);
      pendingRef.current.delete(input.sanpoMapId);
      syncPending();
    },
  });

  const update = useCallback(
    (input: PinsVisibleInput) => {
      if (pendingSanpoMapIdsInFlight.has(input.sanpoMapId)) return;
      pendingSanpoMapIdsInFlight.add(input.sanpoMapId);
      pendingRef.current.add(input.sanpoMapId);
      syncPending();
      setErrorCode(null);
      mutate(input);
    },
    [mutate, syncPending],
  );

  return { update, pendingSanpoMapIds, errorCode };
}
