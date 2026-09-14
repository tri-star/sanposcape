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
  /**
   * 日本語優先の表示名。日本語が無い場合は provider の別言語名、
   * 値が空・不正なら「目的地」。trim 済みかつ最大256 Unicode code point。
   */
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

/**
 * 進行中の散歩。サーバー由来ではない「どの散歩を今やっているか」だけを持つ
 * （ルート本体は TanStack Query が保持する）。
 */
export type ActiveWalk = {
  /** 保存の冪等キー。**散歩開始時**に採番し、終了・再送でも変えない（ADR-003 D3）。 */
  clientWalkId: string;
  /** 散歩の起点（＝周回の終点）。現在地の更新では書き換えない。 */
  origin: GeoCoordinates;
  destination: WalkDestination;
  /** 散歩開始時点の周回ルート全体の目安（分・四捨五入）。/explore/routes の実ルート値。 */
  loopMinutes: number;
  /** 同上（km・小数1桁）。 */
  loopKm: number;
  startedAtMs: number;
};

/**
 * 終了して保存待ちの散歩。サーバー由来の値は一切含まない（保存前の端末側の事実だけ）。
 * track は「生の軌跡」で保持し、送信時の丸め・間引きは walkTrackPayload が行う。
 */
export type FinishedWalk = {
  clientWalkId: string;
  startedAtMs: number;
  endedAtMs: number;
  /** 一時停止を除いた実活動秒（= duration_seconds）。 */
  elapsedSec: number;
  /** GPS ノイズ除去後の実測距離（m）。 */
  distanceMeters: number;
  destination: WalkDestination;
  track: GeoCoordinates[];
};

/** サマリ画面の表示値（FinishedWalk から導出、または画面カタログ用の代表値）。 */
export type WalkSummaryStats = {
  elapsedSec: number;
  /** 小数1桁に丸めた km。 */
  distanceKm: number;
  steps: number;
  goalName: string;
};

/** 散歩記録の保存状態。 */
export type WalkSaveStatus = "idle" | "saving" | "saved" | "error";
