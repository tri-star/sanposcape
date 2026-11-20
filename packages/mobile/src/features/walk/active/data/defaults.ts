import type { ActiveWalk } from "@/features/walk/active/types";

/** 画面カタログ（`ScreenCatalog`）から散歩中画面を単独表示するときに使う代表的なゴール。 */
export type WalkGoalFallback = { name: string; time: number; dist: number };

/**
 * 画面カタログから散歩中画面を単独表示するときに使う代表的なゴール（mock の川辺駅相当）。
 * SS-16 以降 `WalkActiveView` は router params ではなく `useActiveWalkStore` を参照するため、
 * この値は `ScreenCatalog` が `startWalk()` に渡す「代表値」としてのみ使われる
 * （router params 欠落時のフォールバックではない）。
 * 実データ化の見込みが薄いフォールバック定数のため、View（ScreenCatalog）
 * からの直接 import を許容する（`docs/folder-structure.md` の `data/` 参照規律を参照）。
 */
export const DEFAULT_WALK_GOAL: WalkGoalFallback = {
  name: "川辺駅",
  time: 60, // 周回の目安（分）
  dist: 4.0, // 周回の目安距離（km）
};

/**
 * 画面カタログから散歩中画面を単独表示するときに store へ入れる代表値。
 * origin は東京駅（services/location の mock 現在地と同じ）、destination は北西約 900m の地点。
 * 実データ化の見込みが薄い開発用フォールバックのため、View からの直接 import を許容する。
 * startedAtMs / clientWalkId は開くたびに Date.now() / randomUuidV4() を入れるためここには持たない。
 */
export const DEFAULT_ACTIVE_WALK = {
  origin: { latitude: 35.681236, longitude: 139.767125 },
  destination: {
    placeId: "stub-default-goal",
    name: DEFAULT_WALK_GOAL.name,
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  loopMinutes: DEFAULT_WALK_GOAL.time,
  loopKm: DEFAULT_WALK_GOAL.dist,
} as const satisfies Omit<ActiveWalk, "startedAtMs" | "clientWalkId">;
