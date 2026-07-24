import type { Spot } from "@/features/walk/data/types";

/**
 * router params 欠落時に散歩中画面が使う既定ゴール（mock の川辺駅相当）。
 * 将来 API 由来（直近の散歩プラン）に差し替わる可能性のある暫定スタブ。
 */
export const DEFAULT_WALK_GOAL: Pick<Spot, "name" | "time" | "dist"> = {
  name: "川辺駅",
  time: 60, // 往復の目安（分）
  dist: 4.0, // 往復の目安距離（km）
};

/**
 * サマリ画面を単独表示（画面カタログ等）した時の代表的なスタブ結果。
 * mock / デザインギャラリーの StatBlock 例値（00:28:34 / 2.1km / 3,240歩）と揃えている。
 */
export const SAMPLE_WALK_RESULT = {
  elapsedSec: 1714, // 00:28:34 相当
  distKm: "2.1",
  steps: 3240,
  goalName: DEFAULT_WALK_GOAL.name,
} as const;
