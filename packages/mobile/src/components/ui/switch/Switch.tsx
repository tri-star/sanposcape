import { useEffect } from "react";
import { Pressable } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { resolveSwitchAppearance, type SwitchSize } from "@/components/ui/switch/switchStyles";

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  size?: SwitchSize;
  /** 必須。スクリーンリーダー用 */
  accessibilityLabel: string;
  testID?: string;
};

/**
 * RN 標準の `Switch` はスタイル自由度が低いため、`Pressable` + Reanimated で自前実装する。
 * ノブの移動は `theme.motion.base` の duration/bezier を使う。
 *
 * `useUnistyles()` は hitSlop の計算、および Reanimated の `withTiming` に渡す
 * duration/easing(スタイルではなく JS 側のアニメーション設定値)を得るためだけに使う。
 * トラック/ノブの見た目そのものは StyleSheet.create 側で解決する。
 */
export function Switch({
  value,
  onValueChange,
  disabled = false,
  size = "md",
  accessibilityLabel,
  testID,
}: SwitchProps) {
  const { theme } = useUnistyles();
  const appearance = resolveSwitchAppearance(theme, { value, disabled, size });
  const translateX = useSharedValue(appearance.knobTranslateX);

  useEffect(() => {
    translateX.value = withTiming(appearance.knobTranslateX, {
      duration: theme.motion.base.durationMs,
      easing: Easing.bezier(...theme.motion.base.bezier),
    });
  }, [
    appearance.knobTranslateX,
    theme.motion.base.bezier,
    theme.motion.base.durationMs,
    translateX,
  ]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      testID={testID}
      hitSlop={
        appearance.hitSlop > 0
          ? {
              top: appearance.hitSlop,
              bottom: appearance.hitSlop,
              left: appearance.hitSlop,
              right: appearance.hitSlop,
            }
          : undefined
      }
      style={styles.track({ value, disabled, size })}
    >
      <Animated.View style={[styles.knob({ value, disabled, size }), knobStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: (args: { value: boolean; disabled: boolean; size: SwitchSize }) => {
    const appearance = resolveSwitchAppearance(theme, args);
    return {
      width: appearance.trackWidth,
      height: appearance.trackHeight,
      borderRadius: theme.radius.pill,
      backgroundColor: appearance.trackColor,
      opacity: appearance.opacity,
      justifyContent: "center",
    };
  },
  knob: (args: { value: boolean; disabled: boolean; size: SwitchSize }) => {
    const appearance = resolveSwitchAppearance(theme, args);
    return {
      position: "absolute",
      left: appearance.knobInset,
      width: appearance.knobSize,
      height: appearance.knobSize,
      borderRadius: theme.radius.pill,
      backgroundColor: appearance.knobColor,
    };
  },
}));
