import RNSlider from "@react-native-community/slider";
import { type StyleProp, type ViewStyle } from "react-native";

import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SliderProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  /**
   * 必須。省略できると「動かせるように見えて値が変わらない」スライダーを作れてしまうため。
   */
  onChange: (value: number) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Slider — 範囲値を選ぶスライダー（往復時間の指定など）。
 * `@react-native-community/slider` をトークンで着色して薄くラップする。
 * デザイン: Sanpo Design System 相当（mock の `.sanpo-range`）。
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SliderProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <RNSlider
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      value={value}
      minimumValue={min}
      maximumValue={max}
      step={step}
      minimumTrackTintColor={theme.colors.primary}
      maximumTrackTintColor={theme.colors.trackStrong}
      thumbTintColor={theme.colors.primary}
      onValueChange={onChange}
      style={[styles.root, style]}
    />
  );
}

const useStyles = makeStyles(() => ({
  root: {
    width: "100%",
    height: 34,
  },
}));
