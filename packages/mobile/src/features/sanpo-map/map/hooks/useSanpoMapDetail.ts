import { useCallback } from "react";

import {
  useSanpoMapDeleteFlow,
  type UseSanpoMapDeleteFlowResult,
} from "@/features/sanpo-map/map/hooks/useSanpoMapDeleteFlow";
import {
  useSanpoMapMembers,
  type UseSanpoMapMembersResult,
} from "@/features/sanpo-map/map/hooks/useSanpoMapMembers";
import {
  useSanpoMapPins,
  type UseSanpoMapPinsResult,
} from "@/features/sanpo-map/map/hooks/useSanpoMapPins";
import { useSanpoMapRecheck } from "@/features/sanpo-map/map/hooks/useSanpoMapRecheck";
import { useSanpoMaps, type UseSanpoMapsResult } from "@/features/sanpo-map/map/hooks/useSanpoMaps";
import { sanpoMapDeleteDescription } from "@/features/sanpo-map/map/lib/sanpoMapDelete";
import {
  resolveSanpoMapDetailBodyState,
  resolveSanpoMapPinCount,
  type SanpoMapDetailBodyState,
} from "@/features/sanpo-map/map/lib/sanpoMapScreenState";
import { usePullToRefresh } from "@/features/sanpo-map/shared/hooks/usePullToRefresh";
import type { SanpoMap } from "@/features/sanpo-map/shared/types";

export type UseSanpoMapDetailResult = {
  maps: UseSanpoMapsResult;
  /** 地図一覧のキャッシュから id で引いた地図。無ければ undefined。 */
  map: SanpoMap | undefined;
  pins: UseSanpoMapPinsResult;
  /** null = メンバーの行を出さない（地図がまだ分からない）。 */
  members: UseSanpoMapMembersResult | null;
  deleteFlow: UseSanpoMapDeleteFlowResult;
  bodyState: SanpoMapDetailBodyState;
  /** 地図のピンの件数（一覧の値か、取り終えた件数）。分からなければ null。 */
  pinCount: number | null;
  /** 削除の確認ダイアログの本文（段落ごと）。 */
  deleteDescription: string[];
  /** ピン一覧と地図一覧の両方を取り直す（再試行）。 */
  retryAll: () => void;
  pull: ReturnType<typeof usePullToRefresh>;
};

/**
 * 地図詳細（`SanpoMapDetailView`）のデータ（地図・ピン一覧・メンバー・削除の流れ）と、本文の状態の判定。
 * 消した後（`deleteFlow.deleted`）は、この地図のピン・メンバーを取り直さない（404 を踏む。SS-265）。
 */
export function useSanpoMapDetail(
  sanpoMapId: string | null,
  { isSignedIn }: { isSignedIn: boolean },
): UseSanpoMapDetailResult {
  const maps = useSanpoMaps({ enabled: isSignedIn });
  // 地図の削除（SS-265）。確認ダイアログ・戻るの横取り・成功後の遷移は hook に分けてある。
  const deleteFlow = useSanpoMapDeleteFlow(sanpoMapId);
  const { deleted } = deleteFlow;
  const pins = useSanpoMapPins(sanpoMapId, { enabled: isSignedIn && !deleted });

  // 引っ張って更新・再試行は、ピン一覧と地図一覧（地図の名前・件数・存在）の両方を取り直す。
  // 別端末での名前変更の反映と、削除された地図の not-found 化のため（ADR-M-014 D7）。
  const { refresh: refreshPins, retry: retryPins } = pins;
  const { refresh: refreshMaps, retry: retryMaps } = maps;
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPins(), refreshMaps()]);
  }, [refreshPins, refreshMaps]);
  const retryAll = useCallback(() => {
    retryPins();
    retryMaps();
  }, [retryPins, retryMaps]);
  const pull = usePullToRefresh(refreshAll);

  const map =
    sanpoMapId === null ? undefined : maps.maps.find((candidate) => candidate.id === sanpoMapId);
  const showMembers = map !== undefined;
  const members = useSanpoMapMembers(sanpoMapId, {
    enabled: isSignedIn && showMembers && !deleted,
  });

  // 一覧に id が無いときは、古いキャッシュで not-found を確定する前に一覧を1回取り直す。
  const recheck = useSanpoMapRecheck({
    sanpoMapId,
    enabled: isSignedIn && !deleted,
    mapsReady: maps.status === "ready",
    mapFound: map !== undefined,
    mapsFetching: maps.isFetching,
    refreshMaps,
  });

  const bodyState = resolveSanpoMapDetailBodyState({
    hasSanpoMapId: sanpoMapId !== null,
    isSignedIn,
    mapsStatus: maps.status,
    mapFound: map !== undefined,
    mapsFetching: maps.isFetching || recheck.pending,
    pinsErrorCode: pins.errorCode,
  });

  const pinCount =
    map === undefined
      ? null
      : resolveSanpoMapPinCount({
          listPinCount: map.pinCount,
          pinsStatus: pins.status,
          loadedCount: pins.pins.length,
          truncated: pins.truncated,
        });
  const deleteDescription = sanpoMapDeleteDescription({
    pinCount,
    // 自分を除く。取り終えるまでは不明（null）。
    otherMemberCount:
      showMembers && members.status === "ready" ? Math.max(0, members.members.length - 1) : null,
  });

  return {
    maps,
    map,
    pins,
    members: showMembers ? members : null,
    deleteFlow,
    bodyState,
    pinCount,
    deleteDescription,
    retryAll,
    pull,
  };
}
