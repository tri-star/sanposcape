import { useEffect, useRef } from "react";
import { Animated, Pressable, type StyleProp, Text, type ViewStyle } from "react-native";

import { hitSlopFor } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SwitchProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  /** label を省略する場合に指定する。スクリーンリーダー用。 */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

/**
 * Switch — トグルコントロール。ライト/ダークの切り替え設定などに使う。
 * デザイン: Sanpo Design System / components/forms/Switch
 */
export function Switch({
  checked = false,
  onChange,
  label,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: SwitchProps) {
  const theme = useTheme();
  const styles = useStyles();
  const progress = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: checked ? 1 : 0,
      duration: theme.motion.base,
      useNativeDriver: true,
    }).start();
  }, [checked, progress, theme.motion.base]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_INSET, THUMB_INSET + THUMB_TRAVEL],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      testID={testID}
      hitSlop={hitSlopFor(TRACK_HEIGHT)}
      style={[styles.root, disabled ? styles.disabled : null, style]}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Animated.View
        style={[
          styles.track,
          { backgroundColor: checked ? theme.colors.primary : theme.colors.trackStrong },
        ]}
      >
        <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: theme.spacing[3] - 2,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: theme.radius.pill,
    justifyContent: "center",
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    // ON(primary) / OFF(trackStrong) どちらのトラック上でも見えるよう、両テーマで白固定。
    backgroundColor: theme.colors.onColor,
    ...theme.shadows.xs,
  },
}));
