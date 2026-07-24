import type { CategoryMeta, Spot, SpotCategory } from "@/features/walk/data/types";

/**
 * スポットのカテゴリ表示メタ情報。mock の `CATS` を静的に移植したもの。
 * 色は `theme.map.*` を経由するため、ここでは色そのものではなくキーだけを持つ。
 */
export const CATEGORY_META: Record<SpotCategory, CategoryMeta> = {
  konbini: { label: "コンビニ", icon: "store", pin: "cafe", mapColorKey: "cafe" },
  super: { label: "スーパー", icon: "shopping-cart", pin: "culture", mapColorKey: "culture" },
  shop: { label: "店舗", icon: "shopping-bag", pin: "cafe", mapColorKey: "cafe" },
  facility: { label: "施設", icon: "building-2", pin: "culture", mapColorKey: "culture" },
  park: { label: "公園", icon: "trees", pin: "park", mapColorKey: "park" },
  station: { label: "駅", icon: "train-front", pin: "station", mapColorKey: "station" },
};

export const CATEGORY_ORDER: SpotCategory[] = [
  "konbini",
  "super",
  "shop",
  "facility",
  "park",
  "station",
];

/** 散歩開始画面で提示するスポットの静的データ。mock の `SPOTS` を移植。 */
export const SPOTS: Spot[] = [
  { id: "s1", name: "緑町公園", category: "park", time: 20, dist: 1.3, x: 22, y: 20 },
  { id: "s2", name: "ブックカフェ みどり", category: "shop", time: 30, dist: 2.0, x: 34, y: 40 },
  { id: "s3", name: "コンビニ ハーモニー", category: "konbini", time: 15, dist: 1.0, x: 54, y: 58 },
  { id: "s4", name: "さくら駅", category: "station", time: 40, dist: 2.6, x: 72, y: 22 },
  { id: "s5", name: "中央図書館", category: "facility", time: 50, dist: 3.3, x: 60, y: 32 },
  { id: "s6", name: "川沿い遊歩道", category: "park", time: 60, dist: 4.0, x: 20, y: 66 },
  { id: "s7", name: "スーパー フレッシュ", category: "super", time: 75, dist: 4.8, x: 80, y: 74 },
  { id: "s8", name: "雑貨店 そらいろ", category: "shop", time: 35, dist: 2.3, x: 44, y: 82 },
  { id: "s9", name: "川辺駅", category: "station", time: 85, dist: 5.4, x: 66, y: 92 },
  { id: "s10", name: "あおぞら公園", category: "park", time: 100, dist: 6.4, x: 14, y: 90 },
];
