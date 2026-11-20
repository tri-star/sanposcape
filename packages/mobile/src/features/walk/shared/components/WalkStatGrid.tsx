import { View } from "react-native";

import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { formatClock } from "@/lib/formatClock";
import { makeStyles } from "@/theme/makeStyles";

export type WalkStatGridProps = {
  elapsedSec: number;
  distanceKm: number;
  steps: number;
  /**
   * - `stacked`（既定）: 1段目に経過時間、2段目に歩行距離と歩数。サマリ画面（`md`）で使う。
   * - `inline`: 3項目を等幅の3列で1行に置く。高さを増やせない散歩中の下部カード（`sm`）で使う。
   */
  layout?: "stacked" | "inline";
  /** サマリ画面は `md`、散歩中の下部カードは `sm`。 */
  size?: "sm" | "md";
};

/**
 * WalkStatGrid — 散歩の統計3項目（経過時間 / 歩行距離 / 歩数）。
 *
 * どちらの配置も列の幅を固定し、値の桁数で配置を変えない（SS-64）。
 * 以前は内容の幅のまま1行に並べていたため、桁数の多い値（`100,000歩`）で画面外へはみ出した。
 *
 * - `stacked`: サマリ（38px）を等幅3列にすると、幅 360dp の端末で通常の `00:28:34` から列に収まらない。
 *   最も幅を取る経過時間（`100:00:00` で9文字）を単独の行にすると、受け入れる値が 360dp の幅に収まる。
 * - `inline`: 散歩中画面は地図の高さが固定でスクロールしないため、段を増やすと下のボタンがタブバーの裏へ押し出される。
 *   24px の等幅3列は 360dp でも通常の値が収まり、`100:00:00` のような値だけ StatBlock の安全策で少し縮む。
 */
export function WalkStatGrid({
  elapsedSec,
  distanceKm,
  steps,
  layout = "stacked",
  size = "md",
}: WalkStatGridProps) {
  const styles = useStyles();

  const elapsed = (
    <StatBlock
      size={size}
      value={formatClock(elapsedSec)}
      label="経過時間"
      style={layout === "inline" ? styles.column : null}
    />
  );
  const distanceAndSteps = (
    <>
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
    </>
  );

  if (layout === "inline") {
    return (
      <View style={styles.row}>
        {elapsed}
        {distanceAndSteps}
      </View>
    );
  }

  return (
    <View style={styles.stacked}>
      {elapsed}
      <View style={styles.row}>{distanceAndSteps}</View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  stacked: {
    gap: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
  },
  column: {
    flex: 1,
    // 一部の値だけが StatBlock の安全策で縮んだときも、ラベルの高さを揃える
    justifyContent: "space-between",
  },
}));
