import type { ExploreCategory } from "@/api/generated/model";
import type { IconName } from "@/components/ui/icon/Icon";
import type { MapPinCategory } from "@/components/ui/map-pin/MapPin";
import type { GeoCoordinates } from "@/services/location/types";
import type { Theme } from "@/theme/tokens";

/** 探索カテゴリ。API の語彙（snake_case の enum）をそのまま UI の語彙として使う。 */
export type { ExploreCategory };

/** カテゴリごとの表示メタ情報。 */
export type CategoryMeta = {
  label: string;
  icon: IconName;
  pin: MapPinCategory;
  mapColorKey: keyof Theme["map"];
};

/** 画面が扱うスポット候補（PlaceCandidate を camelCase + 表示単位に整形したもの）。 */
export type SpotCandidate = {
  /** Google の place id。SS-16 の /explore/routes/walking に渡す。 */
  id: string;
  name: string;
  category: ExploreCategory;
  location: GeoCoordinates;
  /** 往復の目安（分。四捨五入）。 */
  roundTripMinutes: number;
  /** 往復の目安距離（km。小数1桁）。 */
  roundTripKm: number;
};
