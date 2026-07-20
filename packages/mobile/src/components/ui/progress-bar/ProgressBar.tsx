import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
  clampProgress,
  resolveProgressBarAppearance,
  type ProgressBarSize,
} from "@/components/ui/progress-bar/progressBarStyles";

export type ProgressBarProps = {
  /** 0〜1。範囲外は内部でクランプする */
  value: number;
  size?: ProgressBarSize;
  /** 既定 theme.colors.primary */
  color?: string;
  testID?: string;
};

export function ProgressBar({ value, size = "md", color, testID }: ProgressBarProps) {
  const args = { value, size, color };

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clampProgress(value) * 100) }}
      style={styles.track(args)}
    >
      <View style={styles.fill(args)} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: (args: { value: number; size: ProgressBarSize; color?: string }) => {
    const appearance = resolveProgressBarAppearance(theme, args);
    return {
      height: appearance.height,
      borderRadius: appearance.borderRadius,
      backgroundColor: appearance.trackColor,
      overflow: "hidden",
    };
  },
  fill: (args: { value: number; size: ProgressBarSize; color?: string }) => {
    const appearance = resolveProgressBarAppearance(theme, args);
    return {
      height: "100%",
      width: `${appearance.fillWidthPercent}%`,
      borderRadius: appearance.borderRadius,
      backgroundColor: appearance.fillColor,
    };
  },
}));
