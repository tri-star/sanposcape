import { useCallback, useMemo, useState } from "react";

import { SPOTS } from "@/features/walk/data/spots";
import type { Spot, SpotCategory } from "@/features/walk/data/types";
import { reachableSpots } from "@/features/walk/lib/reachableSpots";

const ALL_CATEGORIES: SpotCategory[] = ["konbini", "super", "shop", "facility", "park", "station"];
const DEFAULT_DURATION_MIN = 60;

export type UseWalkPlanResult = {
  durationMin: number;
  setDurationMin: (value: number) => void;
  activeCategories: SpotCategory[];
  toggleCategory: (category: SpotCategory) => void;
  selectedSpotId: string | null;
  selectSpot: (id: string) => void;
  reachable: Spot[];
  selectedSpot: Spot | null;
  catSheetOpen: boolean;
  openCatSheet: () => void;
  closeCatSheet: () => void;
};

/**
 * 散歩開始画面のローカル状態。
 * duration/表示カテゴリを変えると、mock と同様に選択中の目的地を解除する。
 */
export function useWalkPlan(): UseWalkPlanResult {
  const [durationMin, setDurationMinState] = useState(DEFAULT_DURATION_MIN);
  const [activeCategories, setActiveCategories] = useState<SpotCategory[]>(ALL_CATEGORIES);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);

  const setDurationMin = useCallback((value: number) => {
    setDurationMinState(value);
    setSelectedSpotId(null);
  }, []);

  const toggleCategory = useCallback((category: SpotCategory) => {
    setActiveCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category],
    );
    setSelectedSpotId(null);
  }, []);

  const selectSpot = useCallback((id: string) => {
    setSelectedSpotId(id);
  }, []);

  const openCatSheet = useCallback(() => setCatSheetOpen(true), []);
  const closeCatSheet = useCallback(() => setCatSheetOpen(false), []);

  const reachable = useMemo(
    () => reachableSpots(SPOTS, durationMin, activeCategories),
    [durationMin, activeCategories],
  );

  const selectedSpot = useMemo(
    () => reachable.find((spot) => spot.id === selectedSpotId) ?? null,
    [reachable, selectedSpotId],
  );

  return {
    durationMin,
    setDurationMin,
    activeCategories,
    toggleCategory,
    selectedSpotId,
    selectSpot,
    reachable,
    selectedSpot,
    catSheetOpen,
    openCatSheet,
    closeCatSheet,
  };
}
