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
      <Animated.View style={[styles.knob, knobStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  // ノブの色・サイズ・影は value/disabled に関わらず常に同じ(DS 仕様。
  // switchStyles.ts の resolveSwitchAppearance 参照。value による見た目の変化は
  // knobTranslateX のみで、これは Reanimated 側(knobStyle)が担う。disabled による
  // 見た目の変化は track 側の opacity のみで、Pressable の子である Animated.View にも
  // 視覚的に伝播するため、ここで個別に扱う必要はない)。そのためノブは args を取らない
  // 「静的な」Unistyles スタイルとして定義できる。
  //
  // これは意図的な設計: `Animated.View` は Unistyles v3 の babel プラグインの処理対象外
  // (RN コア以外のサードパーティコンポーネントのため)。`styles.xxx({...})` という
  // 「動的関数スタイル」の呼び出し結果を渡すと、バインドが張られず空オブジェクトに解決され、
  // Reanimated 側で "empty object is not a valid style value" になる。
  // 一方、関数ではない「静的」プロパティ(`styles.knob` を直接参照)は babel 処理なしでも
  // 正しく解決されるため、Animated.View にはこちらのみを渡す
  // (Unistyles 公式「Separate Unistyles and Reanimated styles」の Good 例と同じ形)。
  const knobAppearance = resolveSwitchAppearance(theme, { value: false, disabled: false });

  return {
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
    knob: {
      position: "absolute",
      left: knobAppearance.knobInset,
      width: knobAppearance.knobSize,
      height: knobAppearance.knobSize,
      borderRadius: theme.radius.pill,
      backgroundColor: knobAppearance.knobColor,
      boxShadow: knobAppearance.knobBoxShadow,
    },
  };
});
