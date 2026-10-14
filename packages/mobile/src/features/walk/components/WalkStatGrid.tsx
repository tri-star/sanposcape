import { View } from "react-native";

import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";

export type WalkStatGridProps = {
  elapsedSec: number;
  distanceKm: number;
  steps: number;
  /** サマリ画面は `md`、散歩中の下部カードは `sm`。 */
  size?: "sm" | "md";
};

/**
 * WalkStatGrid — 散歩の統計3項目（経過時間 / 歩行距離 / 歩数）。
 *
 * 1段目に経過時間、2段目に歩行距離と歩数を等幅の2列で置く。値の桁数で配置を変えない（SS-64）。
 * 3つを1行に並べると、桁数の多い値（`100:00:00`・`100,000歩`）が幅 360dp の端末で画面外へはみ出す。
 * 最も幅を取る経過時間（最大9文字）を単独の行にすると、どちらのサイズでも 360dp の幅に収まる。
 */
export function WalkStatGrid({ elapsedSec, distanceKm, steps, size = "md" }: WalkStatGridProps) {
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <StatBlock size={size} value={formatClock(elapsedSec)} label="経過時間" />
      <View style={styles.row}>
        <StatBlock
          size={size}
          value={distanceKm.toFixed(1)}
          unit="km"
          label="歩行距離"
          style={styles.column}
        />
        <StatBlock
          size={size}
          value={steps.toLocaleString()}
          unit="歩"
          label="歩数"
          style={styles.column}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
  },
  column: {
    flex: 1,
  },
}));
