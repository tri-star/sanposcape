import { useEffect, useRef } from "react";
import { Animated, type StyleProp, Text, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type ToastTone = "default" | "success" | "danger";

export type ToastProps = {
  message: string;
  tone?: ToastTone;
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const TONE_ICON: Record<ToastTone, IconName> = {
  default: "info",
  success: "check-circle-2",
  danger: "alert-circle",
};

/**
 * Toast — 一時的に表示する完了通知（例:「散歩を記録しました」）。
 * 表示位置（画面下からのオフセット等）は呼び出し側で `style` に指定する。
 * デザイン: Sanpo Design System / components/feedback/Toast
 */
export function Toast({ message, tone = "default", visible = true, style, testID }: ToastProps) {
  const theme = useTheme();
  const styles = useStyles();
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: theme.motion.base,
      useNativeDriver: true,
    }).start();
  }, [visible, progress, theme.motion.base]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  const toneStyle: Record<ToastTone, { background: string; foreground: string }> = {
    default: { background: theme.colors.surfaceInverse, foreground: theme.colors.textOnInverse },
    success: { background: theme.colors.success, foreground: theme.colors.onColor },
    danger: { background: theme.colors.danger, foreground: theme.colors.onColor },
  };
  const { background, foreground } = toneStyle[tone];

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.root,
        { backgroundColor: background, opacity: progress, transform: [{ translateY }] },
        style,
      ]}
    >
      <Icon name={TONE_ICON[tone]} size={17} color={foreground} />
      <Text style={[styles.message, { color: foreground }]}>{message}</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: theme.spacing[3] - 2,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
    ...theme.shadows.lg,
  },
  message: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.medium,
  },
}));
