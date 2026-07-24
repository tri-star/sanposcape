import type { SpotCategory } from "@/features/walk/data/types";

/**
 * 選択中のカテゴリを要約文言にする純粋関数（mock の `catsSummary`）。
 * 全選択で「すべて」、0件で「なし」、それ以外は「{n}種類」。
 */
export function categorySummary(activeCategories: readonly SpotCategory[], total = 6): string {
  if (activeCategories.length >= total) return "すべて";
  if (activeCategories.length <= 0) return "なし";
  return `${activeCategories.length}種類`;
}
