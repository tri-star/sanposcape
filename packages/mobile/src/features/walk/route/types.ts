import type { WalkDestination } from "@/features/walk/shared/types";
import type { GeoCoordinates } from "@/services/location/types";

/** 地図の表示範囲（API の MapBounds を camelCase 化したもの）。 */
export type WalkRouteBounds = {
  northEast: GeoCoordinates;
  southWest: GeoCoordinates;
};

/** 周回ルートの区間。API の語彙（outbound / return）をそのまま使う。 */
export type WalkRouteLegKind = "outbound" | "return";

export type WalkRouteLeg = {
  kind: WalkRouteLegKind;
  /** この区間の所要時間（秒）。 */
  durationSeconds: number;
  /** この区間の距離（m）。 */
  distanceMeters: number;
  /** この区間の折れ線。不正点を除外した結果が2点未満なら空配列（線を描かない）。 */
  path: GeoCoordinates[];
};

/**
 * 提示する周回ルート（現在地 → 目的地 → 往路と異なる道 → 現在地）を画面用に整形したもの。
 * duration/distance は **周回全体** の値（SS-33 以降。PlaceCandidate の往復値は片道×2の近似のまま）。
 */
export type WalkRoute = {
  origin: GeoCoordinates;
  destination: WalkDestination;
  /** 周回全体の所要時間（秒）。 */
  durationSeconds: number;
  /** 周回全体の距離（m）。 */
  distanceMeters: number;
  /** [往路, 復路] の順。toWalkRoute が kind で並べ替えて保証する。 */
  legs: [WalkRouteLeg, WalkRouteLeg];
  /** 別の帰り道を作れず、往路を逆向きに戻るフォールバックになったか。 */
  returnIsSamePath: boolean;
  /** 周回全体を覆う矩形。 */
  bounds: WalkRouteBounds;
};
