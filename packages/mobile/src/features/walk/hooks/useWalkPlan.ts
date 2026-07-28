import { useCallback, useState } from "react";

import type { SpotCategory } from "@/features/walk/data/types";

const ALL_CATEGORIES: SpotCategory[] = ["konbini", "super", "shop", "facility", "park", "station"];
const DEFAULT_DURATION_MIN = 60;

export type UseWalkPlanResult = {
  durationMin: number;
  setDurationMin: (value: number) => void;
  activeCategories: SpotCategory[];
  toggleCategory: (category: SpotCategory) => void;
  selectedSpotId: string | null;
  selectSpot: (id: string) => void;
  clearSelectedSpot: () => void;
  catSheetOpen: boolean;
  openCatSheet: () => void;
  closeCatSheet: () => void;
};

/**
 * 散歩開始画面のローカル状態。
 * duration/表示カテゴリを変えると、古い API 応答に紐付く目的地を解除する。
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
    setSelectedSpotId((previous) => (previous === id ? null : id));
  }, []);

  const clearSelectedSpot = useCallback(() => setSelectedSpotId(null), []);

  const openCatSheet = useCallback(() => setCatSheetOpen(true), []);
  const closeCatSheet = useCallback(() => setCatSheetOpen(false), []);

  return {
    durationMin,
    setDurationMin,
    activeCategories,
    toggleCategory,
    selectedSpotId,
    selectSpot,
    clearSelectedSpot,
    catSheetOpen,
    openCatSheet,
    closeCatSheet,
  };
}
