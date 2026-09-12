import type { ActiveWalk, FinishedWalk, WalkSummaryStats } from "@/features/walk/types";

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
  // SS-33 で ActiveWalk.roundTripMinutes/roundTripKm の出所が /explore/places の概算から
  // 周回ルートの実値（/explore/routes/walking 由来）に変わったため、ここも「実値相当」の
  // 代表値として扱う（画面カタログ用の固定値であり実際のルート取得は行わない）。
  time: 60, // 周回ルート実値相当の代表値（分）
  dist: 4.0, // 同、距離（km）
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
  roundTripMinutes: DEFAULT_WALK_GOAL.time,
  roundTripKm: DEFAULT_WALK_GOAL.dist,
} as const satisfies Omit<ActiveWalk, "startedAtMs" | "clientWalkId">;

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

/**
 * サマリ画面のフォールバック表示値（`SAMPLE_WALK_RESULT` を `WalkSummaryStats` の形へ揃えたもの）。
 * `useWalkSummary` がドラフト無し（deep link・画面カタログ直叩き）のときに使う。
 */
export const SAMPLE_WALK_SUMMARY_STATS = {
  elapsedSec: SAMPLE_WALK_RESULT.elapsedSec,
  distanceKm: Number(SAMPLE_WALK_RESULT.distKm),
  steps: SAMPLE_WALK_RESULT.steps,
  goalName: SAMPLE_WALK_RESULT.goalName,
} as const satisfies WalkSummaryStats;

/**
 * 画面カタログから散歩サマリを単独表示するときに store へ入れる代表値。
 * 呼び出し側が Date.now() と randomUuidV4() を渡す（この関数自体は純粋に保つ）。
 * これを積んで /walk-summary を開くと **実際に POST /walks が走る**ため、
 * 屋外に出ずに保存経路と SS-20 の履歴反映を手元で確認できる。
 */
export function buildSampleFinishedWalk(input: {
  nowMs: number;
  clientWalkId: string;
}): FinishedWalk {
  const { nowMs, clientWalkId } = input;
  const startedAtMs = nowMs - SAMPLE_WALK_RESULT.elapsedSec * 1000;
  const origin = DEFAULT_ACTIVE_WALK.origin;
  const destination = DEFAULT_ACTIVE_WALK.destination;

  // origin → destination を結ぶ4点の直線補間（表示・送信整形の確認に足りる程度で十分）。
  const steps = 3;
  const track = Array.from({ length: steps + 1 }, (_, i) => {
    const ratio = i / steps;
    return {
      latitude: origin.latitude + (destination.location.latitude - origin.latitude) * ratio,
      longitude: origin.longitude + (destination.location.longitude - origin.longitude) * ratio,
    };
  });

  return {
    clientWalkId,
    startedAtMs,
    endedAtMs: nowMs,
    elapsedSec: SAMPLE_WALK_RESULT.elapsedSec,
    distanceMeters: Number(SAMPLE_WALK_RESULT.distKm) * 1000,
    destination,
    track,
  };
}
