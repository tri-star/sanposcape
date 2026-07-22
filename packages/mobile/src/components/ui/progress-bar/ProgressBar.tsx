import { type StyleProp, Text, View, type ViewStyle } from "react-native";

import { toPercent } from "@/lib/toPercent";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type ProgressBarTone = "primary" | "accent" | "success";

export type ProgressBarProps = {
  value?: number;
  max?: number;
  tone?: ProgressBarTone;
  /** 指定するとバーの上にラベルと達成率を表示する。 */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * ProgressBar — 直線的な進捗表示（例: 記録画面の1日の目標歩数）。
 * デザイン: Sanpo Design System / components/data/ProgressBar
 */
export function ProgressBar({
  value = 0,
  max = 100,
  tone = "primary",
  label,
  style,
  testID,
}: ProgressBarProps) {
  const theme = useTheme();
  const styles = useStyles();
  const percent = toPercent(value, max);

  const toneColor: Record<ProgressBarTone, string> = {
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    success: theme.colors.success,
  };

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      style={[styles.root, style]}
    >
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>{label}</Text>
          <Text style={styles.labelText}>{Math.round(percent)}%</Text>
        </View>
      ) : null}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: toneColor[tone] }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    width: "100%",
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  labelText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  track: {
    height: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.trackSubtle,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: theme.radius.pill,
  },
}));
