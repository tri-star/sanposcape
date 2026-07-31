export type WalkTrackingStatus = "idle" | "acquiring" | "tracking" | "error";

/** Badge の tone。`@/components/ui/badge/Badge` を import しない（react-native 依存を避ける）。 */
export type WalkTrackingBadgeTone = "info" | "success" | "warning" | "danger";

const BADGES: Record<WalkTrackingStatus, { label: string; tone: WalkTrackingBadgeTone }> = {
  idle: { label: "GPS停止中", tone: "info" },
  acquiring: { label: "GPS取得中", tone: "warning" },
  tracking: { label: "GPS良好", tone: "success" },
  error: { label: "GPS未取得", tone: "danger" },
};

/** トラッキング状態 → バッジ表示への写像。`WalkStatsPanel` の見た目テストが書けない分、判定だけでも守る。 */
export function walkTrackingBadge(status: WalkTrackingStatus): {
  label: string;
  tone: WalkTrackingBadgeTone;
} {
  return BADGES[status];
}
