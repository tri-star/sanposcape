import { useEffect } from "react";
import { Pressable } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { resolveSwitchAppearance } from "@/components/ui/switch/switchStyles";

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** 必須。スクリーンリーダー用 */
  accessibilityLabel: string;
  testID?: string;
};

/**
 * RN 標準の `Switch` はスタイル自由度が低いため、`Pressable` + Reanimated で自前実装する。
 * ノブの移動は `theme.motion.base` の duration/bezier を使う。
 * DS のトラック/ノブは単一サイズのみのため `size` prop は持たない(B-5)。
 *
 * `useUnistyles()` は hitSlop の計算、および Reanimated の `withTiming` に渡す
 * duration/easing(スタイルではなく JS 側のアニメーション設定値)を得るためだけに使う。
 * トラック/ノブの見た目そのものは StyleSheet.create 側で解決する。
 */
export function Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: SwitchProps) {
  const { theme } = useUnistyles();
  const appearance = resolveSwitchAppearance(theme, { value, disabled });
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

  // ノブの見た目は Unistyles の `StyleSheet.create` ではなく、ここでプレーンな
  // スタイルオブジェクトとして組み立てる。
  //
  // 理由: `Animated.View`(Reanimated)に Unistyles のスタイルを渡すと、静的・動的を
  // 問わず空オブジェクトに解決され "empty object is not a valid style value" で落ちる。
  // Unistyles の babel プラグインは `react-native-reanimated/src/component` を処理対象に
  // 含んでいるはず(plugin/index.js の REPLACE_WITH_UNISTYLES_PATHS)だが、
  // この構成(Unistyles 3.3.0 + Reanimated 4.5.0 + Expo SDK 57 / pnpm hoisted)では
  // 実機で機能しなかった。原因調査を続けるより、Unistyles の機構を経由しない形にして
  // 確実に動かすことを優先している。
  //
  // このオブジェクトは theme 由来の値を含むが、Unistyles のスタイル登録は経由しないため
  // テーマ切替時は `useUnistyles()` の再レンダーで再計算される(このコンポーネントは
  // hitSlop と withTiming のために元々 `useUnistyles()` を使っている)。
  //
  // 将来的には `withUnistyles(Animated.View)` での解決を検討する余地がある。
  const knobBaseStyle = {
    position: "absolute" as const,
    left: appearance.knobInset,
    width: appearance.knobSize,
    height: appearance.knobSize,
    borderRadius: theme.radius.pill,
    backgroundColor: appearance.knobColor,
    boxShadow: appearance.knobBoxShadow,
  };

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
      style={styles.track({ value, disabled })}
    >
      <Animated.View style={[knobBaseStyle, knobStyle]} />
    </Pressable>
  );
}

// トラックは素の `Pressable`(RN コア = babel プラグインの処理対象)に渡すため、
// Unistyles の `StyleSheet.create` をそのまま使える。
// ノブだけが `Animated.View` に渡るため、上記のとおり別扱いにしている。
const styles = StyleSheet.create((theme) => ({
  track: (args: { value: boolean; disabled: boolean }) => {
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
}));
