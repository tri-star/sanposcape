import { View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

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
  const { theme } = useUnistyles();
  const appearance = resolveProgressBarAppearance(theme, { value, size, color });
  const now = Math.round(clampProgress(value) * 100);

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now }}
      style={{
        height: appearance.height,
        borderRadius: appearance.borderRadius,
        backgroundColor: appearance.trackColor,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${appearance.fillWidthPercent}%`,
          borderRadius: appearance.borderRadius,
          backgroundColor: appearance.fillColor,
        }}
      />
    </View>
  );
}
