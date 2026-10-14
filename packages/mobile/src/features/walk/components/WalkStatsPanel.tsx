import { View } from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { WalkStatGrid } from "@/features/walk/components/WalkStatGrid";
import type { WalkTrackingStatus } from "@/features/walk/lib/walkTrackingStatus";
import { walkTrackingBadge } from "@/features/walk/lib/walkTrackingStatus";
import { makeStyles } from "@/theme/makeStyles";

export type WalkStatsPanelProps = {
  elapsedSec: number;
  /** 実測の移動距離（m）。 */
  distanceMeters: number;
  steps: number;
  paused: boolean;
  trackingStatus: WalkTrackingStatus;
  /** 「正確な位置情報」がオフ。記録中のバッジを「位置が大まか」にする。 */
  approximateLocation: boolean;
  onTogglePause: () => void;
  onEnd: () => void;
  onAddPin: () => void;
};

/**
 * WalkStatsPanel — 散歩中の下部カード（ステータス・stats・操作ボタン）。
 * デザイン: mock `isMain` の stats カード。
 */
export function WalkStatsPanel({
  elapsedSec,
  distanceMeters,
  steps,
  paused,
  trackingStatus,
  approximateLocation,
  onTogglePause,
  onEnd,
  onAddPin,
}: WalkStatsPanelProps) {
  const styles = useStyles();
  const gps = walkTrackingBadge(trackingStatus, { approximate: approximateLocation });

  return (
    <Card style={styles.root} testID="walk-stats-panel">
      <View style={styles.badgeRow}>
        <Badge tone={paused ? "warning" : "info"} dot>
          {paused ? "一時停止中" : "ナビゲーション中"}
        </Badge>
        <Badge tone={gps.tone}>{gps.label}</Badge>
      </View>

      <WalkStatGrid
        layout="inline"
        size="sm"
        elapsedSec={elapsedSec}
        distanceKm={distanceMeters / 1000}
        steps={steps}
      />

      <View style={styles.buttonRow}>
        <Button
          testID="walk-active-toggle-pause"
          variant="secondary"
          icon={paused ? "play" : "pause"}
          style={styles.pauseButton}
          onPress={onTogglePause}
        >
          {paused ? "再開" : "一時停止"}
        </Button>
        <Button
          testID="walk-active-end"
          variant="primary"
          icon="square"
          style={styles.endButton}
          onPress={onEnd}
        >
          終了する
        </Button>
      </View>

      <Button
        testID="walk-active-add-pin"
        variant="outline"
        icon="map-pin"
        fullWidth
        onPress={onAddPin}
      >
        この場所にピンを追加
      </Button>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[3] + 2,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  pauseButton: {
    flex: 1,
  },
  endButton: {
    flex: 1.4,
  },
}));
