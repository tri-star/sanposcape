import type { ActiveWalk } from "@/features/walk/types";

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
 * 画面カタログから散歩中画面を単独表示するときに store へ入れる代表値。
 * origin は東京駅（services/location の mock 現在地と同じ）、destination は北西約 900m の地点。
 * 実データ化の見込みが薄い開発用フォールバックのため、View からの直接 import を許容する。
 * startedAtMs は開くたびに Date.now() を入れるためここには持たない。
 */
export const DEFAULT_ACTIVE_WALK = {
  origin: { latitude: 35.681236, longitude: 139.767125 },
  destination: {
    placeId: "stub-default-goal",
    name: DEFAULT_WALK_GOAL.name,
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  roundTripMinutes: DEFAULT_WALK_GOAL.time,
  roundTripKm: DEFAULT_WALK_GOAL.dist,
} as const satisfies Omit<ActiveWalk, "startedAtMs">;

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
