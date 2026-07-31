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

/** 散歩ルートの目的地（Expo Router の route と混同しないよう walkRoute 系の語彙で統一する）。 */
export type WalkDestination = {
  /** Google の place id（SpotCandidate.id）。 */
  placeId: string;
  name: string;
  location: GeoCoordinates;
};

/** 地図の表示範囲（API の MapBounds を camelCase 化したもの）。 */
export type WalkRouteBounds = {
  northEast: GeoCoordinates;
  southWest: GeoCoordinates;
};

/**
 * 提示する徒歩ルート（/explore/routes/walking のレスポンスを画面用に整形したもの）。
 * duration/distance は **片道** の値である点に注意（PlaceCandidate は往復値）。
 */
export type WalkRoute = {
  origin: GeoCoordinates;
  destination: WalkDestination;
  /** 片道の所要時間（秒）。 */
  durationSeconds: number;
  /** 片道の距離（m）。 */
  distanceMeters: number;
  /** 道のりの折れ線（2点以上）。 */
  path: GeoCoordinates[];
  bounds: WalkRouteBounds;
};

/**
 * 進行中の散歩。サーバー由来ではない「どの散歩を今やっているか」だけを持つ
 * （ルート本体は TanStack Query が保持する）。
 */
export type ActiveWalk = {
  /** 散歩の起点。散歩中もこの値でルートを引き続けるため、現在地の更新では書き換えない。 */
  origin: GeoCoordinates;
  destination: WalkDestination;
  /** 探索結果由来の往復目安（表示用）。 */
  roundTripMinutes: number;
  roundTripKm: number;
  /** 開始時刻（`Date.now()`）。経過時間はこの値から計算する。 */
  startedAtMs: number;
};
