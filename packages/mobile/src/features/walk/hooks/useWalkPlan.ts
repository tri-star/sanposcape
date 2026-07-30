import { useCallback, useMemo, useState } from "react";

import type { ExploreCategory } from "@/api/generated/model";
import { DEFAULT_CATEGORIES, DEFAULT_DURATION_MIN } from "@/features/walk/data/categories";
import { isCandidateListLoading } from "@/features/walk/lib/candidateListState";
import { useCurrentLocation } from "@/features/walk/hooks/useCurrentLocation";
import { useSpotCandidates } from "@/features/walk/hooks/useSpotCandidates";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { clampRoundTripMinutes } from "@/features/walk/lib/placeSearchRequest";
import type { SpotCandidate } from "@/features/walk/types";
import type { GeoCoordinates, LocationErrorCode } from "@/services/location/types";

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
};

/**
 * 散歩開始画面のローカル状態。
 * `useCurrentLocation` / `useSpotCandidates` を合成し、往復時間・カテゴリ・選択スポットは
 * この画面に閉じた一時状態として保持する（横断利用が発生した時点で昇格する。§3.7）。
 *
 * API 呼び出しを抑えるため、再探索が走るのは「スライダーを離した」「カテゴリを確定した」
 * 「現在地を取り直した」「手動リトライ」の4つだけにする（§6.3）。
 */
export function useWalkPlan(): UseWalkPlanResult {
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
  });

  const selectSpot = useCallback((id: string) => {
    setSelectedSpotId(id);
  }, []);

  const selectedSpot = useMemo(
    () => explore.candidates.find((spot) => spot.id === selectedSpotId) ?? null,
    [explore.candidates, selectedSpotId],
  );

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
  };
}
