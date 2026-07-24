import type { Spot, SpotCategory } from "@/features/walk/data/types";

/**
 * 往復時間・表示カテゴリで「歩いて行けるスポット」を絞り込む純粋関数（mock の `reach` 相当）。
 * `sp.time <= durationMin` は境界（等しい場合）を含む。
 */
export function reachableSpots(
  spots: readonly Spot[],
  durationMin: number,
  activeCategories: readonly SpotCategory[],
): Spot[] {
  return spots.filter(
    (spot) => spot.time <= durationMin && activeCategories.includes(spot.category),
  );
}
