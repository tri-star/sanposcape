import type { IconName } from "@/components/ui/icon/Icon";
import type { MapPinCategory } from "@/components/ui/map-pin/MapPin";
import type { Theme } from "@/theme/tokens";

/** スポットのカテゴリ（mock の `CATS` キー）。 */
export type SpotCategory = "konbini" | "super" | "shop" | "facility" | "park" | "station";

/** 散歩開始画面で提示する「歩いて行けるスポット」の静的データ。 */
export type Spot = {
  id: string;
  name: string;
  category: SpotCategory;
  /** 往復の目安（分）。 */
  time: number;
  /** 往復の目安距離（km）。 */
  dist: number;
  /** 地図プレースホルダ上の相対位置（%）。 */
  x: number;
  y: number;
};

/** カテゴリごとの表示メタ情報（mock の `CATS` に対応）。 */
export type CategoryMeta = {
  label: string;
  icon: IconName;
  pin: MapPinCategory;
  mapColorKey: keyof Theme["map"];
};
