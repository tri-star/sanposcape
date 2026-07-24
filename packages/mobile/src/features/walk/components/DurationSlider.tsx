import { Text, View } from "react-native";

import { Slider } from "@/components/ui/slider/Slider";
import { estimateRoundTripKm } from "@/features/walk/lib/walkStats";
import { makeStyles } from "@/theme/makeStyles";

export type DurationSliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  /**
   * 必須。省略できると「動かせるように見えて値が変わらない」スライダーを作れてしまうため。
   */
  onChange: (value: number) => void;
  testID?: string;
};

/**
 * DurationSlider — 往復時間（分）を選ぶスライダー＋見積り距離表示。
 * デザイン: mock `isStart` の「往復の時間」ブロック。
 * `WalkStartView` から切り出し、`estimateRoundTripKm` を内包する（プラン§5.4の当初想定）。
 */
export function DurationSlider({ value, min, max, step, onChange, testID }: DurationSliderProps) {
  const styles = useStyles();
  const roundTripKm = estimateRoundTripKm(value);

  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.label}>往復の時間</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.unit}>分（約{roundTripKm.toFixed(1)}km）</Text>
        </View>
      </View>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        accessibilityLabel="往復の時間"
        testID={testID}
      />
      <View style={styles.bounds}>
        <Text style={styles.boundLabel}>{min}分</Text>
        <Text style={styles.boundLabel}>{max}分</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
  },
  label: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  value: {
    fontSize: theme.typography.size["2xl"] + 2,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.primary,
  },
  unit: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  bounds: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing[1] + 2,
  },
  boundLabel: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
}));
