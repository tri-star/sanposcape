/** 散歩中画面が router params 欠落時に使う既定ゴール。 */
export type WalkGoalFallback = { name: string; time: number; dist: number };

/**
 * router params 欠落時に散歩中画面が使う既定ゴール（mock の川辺駅相当）。
 * 実データ化の見込みが薄いフォールバック定数のため、View（WalkActiveView/ScreenCatalog）
 * からの直接 import を許容する（`docs/folder-structure.md` の `data/` 参照規律を参照）。
 */
export const DEFAULT_WALK_GOAL: WalkGoalFallback = {
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
