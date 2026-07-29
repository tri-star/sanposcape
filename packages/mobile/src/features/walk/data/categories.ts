import type { CategoryMeta, ExploreCategory } from "@/features/walk/types";

/**
 * カテゴリごとの表示メタ情報。旧 mock（`konbini` 等）のメタ情報を ExploreCategory キーへ付け替えて移設。
 * 色は `theme.map.*` を経由するため、ここでは色そのものではなくキーだけを持つ。
 */
export const CATEGORY_META: Record<ExploreCategory, CategoryMeta> = {
  convenience_store: { label: "コンビニ", icon: "store", pin: "cafe", mapColorKey: "cafe" },
  supermarket: { label: "スーパー", icon: "shopping-cart", pin: "culture", mapColorKey: "culture" },
  retail: { label: "店舗", icon: "shopping-bag", pin: "cafe", mapColorKey: "cafe" },
  facility: { label: "施設", icon: "building-2", pin: "culture", mapColorKey: "culture" },
  park: { label: "公園", icon: "trees", pin: "park", mapColorKey: "park" },
  station: { label: "駅", icon: "train-front", pin: "station", mapColorKey: "station" },
};

export const CATEGORY_ORDER: ExploreCategory[] = [
  "convenience_store",
  "supermarket",
  "retail",
  "facility",
  "park",
  "station",
];

/** 初期状態は全カテゴリ。 */
export const DEFAULT_CATEGORIES: ExploreCategory[] = [...CATEGORY_ORDER];

/** 往復時間の初期値（分）。 */
export const DEFAULT_DURATION_MIN = 60;
