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
  /** 保存の冪等キー。**散歩開始時**に採番し、終了・再送でも変えない（ADR-003 D3）。 */
  clientWalkId: string;
  /** 散歩の起点。散歩中もこの値でルートを引き続けるため、現在地の更新では書き換えない。 */
  origin: GeoCoordinates;
  destination: WalkDestination;
  /** 探索結果由来の往復目安（表示用）。 */
  roundTripMinutes: number;
  roundTripKm: number;
  /** 開始時刻（`Date.now()`）。経過時間はこの値から計算する。 */
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

/**
 * 現在地起点のルート再計算の状態（SS-35）。
 * `idle`   … 再計算していない／直近の再計算は成功済み
 * `recalculating` … リクエスト中（同時に1つだけ）
 * `failed` … 直近のリクエストが失敗し、表示は直前の正常ルートのまま
 */
export type WalkRouteRecalcStatus = "idle" | "recalculating" | "failed";
