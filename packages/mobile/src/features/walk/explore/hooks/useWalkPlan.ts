import { useCallback, useMemo, useState } from "react";

import type { ExploreCategory } from "@/api/generated/model";
import { DEFAULT_CATEGORIES, DEFAULT_DURATION_MIN } from "@/features/walk/explore/data/categories";
import { isCandidateListLoading } from "@/features/walk/explore/lib/candidateListState";
import { useSpotCandidates } from "@/features/walk/explore/hooks/useSpotCandidates";
import { useWalkRoute } from "@/features/walk/route/hooks/useWalkRoute";
import type { ExploreErrorCode } from "@/features/walk/explore/lib/exploreError";
import { clampRoundTripMinutes } from "@/features/walk/explore/lib/placeSearchRequest";
import type { SpotCandidate } from "@/features/walk/explore/types";
import type { WalkDestination } from "@/features/walk/shared/types";
import type { WalkRoute } from "@/features/walk/route/types";
import { useLocationPrecision } from "@/features/walk/shared/hooks/useLocationPrecision";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import type {
  GeoCoordinates,
  LocationErrorCode,
  LocationPrecision,
} from "@/services/location/types";

export type UseWalkPlanResult = {
  /** スライダー表示用の値（ドラッグ中も追従）。 */
  durationMin: number;
  setDurationMin: (value: number) => void;
  /** 指を離した時に確定して探索をトリガする。 */
  commitDurationMin: (value: number) => void;

  /** 確定済み（探索に使われている）カテゴリ。 */
  activeCategories: ExploreCategory[];
  /** シート内で編集中のカテゴリ（未確定）。 */
  draftCategories: ExploreCategory[];
  toggleCategory: (category: ExploreCategory) => void;
  catSheetOpen: boolean;
  openCatSheet: () => void;
  /** 破棄して閉じる。 */
  closeCatSheet: () => void;
  /** draft を確定して閉じる（＝再探索）。 */
  applyCategories: () => void;

  origin: GeoCoordinates | null;
  locationErrorCode: LocationErrorCode | null;
  /** 精度の許可（「正確な位置情報」）。現在地が取れるまでは null。 */
  locationPrecision: LocationPrecision | null;
  isLocating: boolean;
  retryLocation: () => void;

  candidates: SpotCandidate[];
  isLoadingCandidates: boolean;
  isRefetchingCandidates: boolean;
  exploreErrorCode: ExploreErrorCode | null;
  retryExplore: () => void;

  selectedSpotId: string | null;
  selectSpot: (id: string) => void;
  selectedSpot: SpotCandidate | null;
  /**
   * 目的地。ピンを目的地にして開いたときはそのピン（`pinDestination`）、それ以外は `selectedSpot` から組み立てたもの
   * （`useWalkRoute` にもこの値を渡す）。散歩開始時の引き渡し用。
   */
  destination: WalkDestination | null;

  walkRoute: WalkRoute | null;
  isLoadingWalkRoute: boolean;
  walkRouteErrorCode: ExploreErrorCode | null;
  retryWalkRoute: () => void;
  /** 目的地が確定し、ルートも提示できている（＝散歩を始められる）。 */
  canStartWalk: boolean;
};

/**
 * 散歩開始画面のローカル状態。
 * `useCurrentLocation` / `useSpotCandidates` を合成し、往復時間・カテゴリ・選択スポットは
 * この画面に閉じた一時状態として保持する（横断利用が発生した時点で昇格する。§3.7）。
 *
 * API 呼び出しを抑えるため、再探索が走るのは「スライダーを離した」「カテゴリを確定した」
 * 「現在地を取り直した」「手動リトライ」の4つだけにする（§6.3）。
 *
 * `pinDestination` を渡すと（ピン詳細の「このピンまで散歩する」。SS-170）、目的地をそのピンに固定し、
 * スポットの候補は探索しない（`/explore/places` を呼ばない）。
 */
export function useWalkPlan(
  options: { pinDestination?: WalkDestination | null } = {},
): UseWalkPlanResult {
  const pinDestination = options.pinDestination ?? null;
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [searchDurationMin, setSearchDurationMin] = useState(DEFAULT_DURATION_MIN);

  const [activeCategories, setActiveCategories] = useState<ExploreCategory[]>(DEFAULT_CATEGORIES);
  const [draftCategories, setDraftCategories] = useState<ExploreCategory[]>(DEFAULT_CATEGORIES);
  const [catSheetOpen, setCatSheetOpen] = useState(false);

  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // 分割代入して受ける: `useCurrentLocation` の戻り値は毎レンダー新しいオブジェクトなので、
  // オブジェクトのまま useCallback の依存に置くとコールバックの identity が毎回変わる。
  const {
    coordinates: origin,
    errorCode: locationErrorCode,
    isLoading: isLocating,
    retry: retryCurrentLocation,
  } = useCurrentLocation();
  // 現在地が取れてから確かめる（初回のダイアログで許可された直後でも正しい値を読める）。
  const locationPrecision = useLocationPrecision({ enabled: origin !== null });

  const commitDurationMin = useCallback((value: number) => {
    const clamped = clampRoundTripMinutes(value);
    setSearchDurationMin(clamped);
    setSelectedSpotId(null);
  }, []);

  const toggleCategory = useCallback((category: ExploreCategory) => {
    setDraftCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category],
    );
  }, []);

  const openCatSheet = useCallback(() => {
    setDraftCategories(activeCategories);
    setCatSheetOpen(true);
  }, [activeCategories]);

  const closeCatSheet = useCallback(() => {
    setCatSheetOpen(false);
  }, []);

  const applyCategories = useCallback(() => {
    if (draftCategories.length === 0) return;
    setActiveCategories(draftCategories);
    setSelectedSpotId(null);
    setCatSheetOpen(false);
  }, [draftCategories]);

  const explore = useSpotCandidates({
    origin,
    durationMin: searchDurationMin,
    categories: activeCategories,
    enabled: pinDestination === null,
  });

  const selectSpot = useCallback((id: string) => {
    setSelectedSpotId(id);
  }, []);

  const selectedSpot = useMemo(
    () => explore.candidates.find((spot) => spot.id === selectedSpotId) ?? null,
    [explore.candidates, selectedSpotId],
  );

  const destination = useMemo<WalkDestination | null>(() => {
    if (pinDestination !== null) return pinDestination;
    return selectedSpot === null
      ? null
      : { placeId: selectedSpot.id, name: selectedSpot.name, location: selectedSpot.location };
  }, [pinDestination, selectedSpot]);

  const route = useWalkRoute({ origin, destination });
  const canStartWalk = destination !== null && route.walkRoute !== null;

  const retryLocation = useCallback(() => {
    setSelectedSpotId(null);
    retryCurrentLocation();
  }, [retryCurrentLocation]);

  // 測位中も「準備中」としてローディング扱いにする（判定は lib の純粋関数に寄せてテスト可能にする）。
  const isLoadingCandidates = isCandidateListLoading({
    isExploreLoading: explore.isLoading,
    hasOrigin: origin !== null,
    hasLocationError: locationErrorCode !== null,
  });

  return {
    durationMin,
    setDurationMin,
    commitDurationMin,

    activeCategories,
    draftCategories,
    toggleCategory,
    catSheetOpen,
    openCatSheet,
    closeCatSheet,
    applyCategories,

    origin,
    locationErrorCode,
    locationPrecision,
    isLocating,
    retryLocation,

    candidates: explore.candidates,
    isLoadingCandidates,
    isRefetchingCandidates: explore.isRefetching,
    exploreErrorCode: explore.errorCode,
    retryExplore: explore.refetch,

    selectedSpotId,
    selectSpot,
    selectedSpot,
    destination,

    walkRoute: route.walkRoute,
    isLoadingWalkRoute: route.isLoading,
    walkRouteErrorCode: route.errorCode,
    retryWalkRoute: route.retry,
    canStartWalk,
  };
}
