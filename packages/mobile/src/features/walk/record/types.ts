import type { WalkDestination } from "@/features/walk/shared/types";
import type { GeoCoordinates } from "@/services/location/types";

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
