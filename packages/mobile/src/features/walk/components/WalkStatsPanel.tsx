import { View } from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";

export type WalkStatsPanelProps = {
  elapsedSec: number;
  distKm: number;
  steps: number;
  paused: boolean;
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
  distKm,
  steps,
  paused,
  onTogglePause,
  onEnd,
  onAddPin,
}: WalkStatsPanelProps) {
  const styles = useStyles();

  return (
    <Card style={styles.root} testID="walk-stats-panel">
      <View style={styles.badgeRow}>
        <Badge tone={paused ? "warning" : "info"} dot>
          {paused ? "一時停止中" : "ナビゲーション中"}
        </Badge>
        <Badge tone="success">GPS良好</Badge>
      </View>

      <View style={styles.statRow}>
        <StatBlock size="sm" value={formatClock(elapsedSec)} label="経過時間" />
        <StatBlock size="sm" value={distKm.toFixed(1)} unit="km" label="歩行距離" />
        <StatBlock size="sm" value={steps.toLocaleString()} unit="歩" label="歩数" />
      </View>

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
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
