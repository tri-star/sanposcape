import { useEffect } from "react";
import { Pressable } from "react-native";
import { useUnistyles } from "react-native-unistyles";
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
      style={{
        width: appearance.trackWidth,
        height: appearance.trackHeight,
        borderRadius: theme.radius.pill,
        backgroundColor: appearance.trackColor,
        opacity: appearance.opacity,
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            left: appearance.knobInset,
            width: appearance.knobSize,
            height: appearance.knobSize,
            borderRadius: theme.radius.pill,
            backgroundColor: appearance.knobColor,
          },
          knobStyle,
        ]}
      />
    </Pressable>
  );
}
