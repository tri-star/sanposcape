import type { ReactNode } from "react";
import { type StyleProp, Text, View, type ViewStyle } from "react-native";

import { makeStyles } from "@/theme/makeStyles";
import { letterSpacing } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export type BadgeTone = "info" | "success" | "warning" | "danger" | "neutral";

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  /** 先頭に状態を示すドットを出す。 */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Badge — 小さなステータスピル（例: 「ナビゲーション中」）。
 * デザイン: Sanpo Design System / components/feedback/Badge
 */
export function Badge({ children, tone = "info", dot = false, style, testID }: BadgeProps) {
  const theme = useTheme();
  const styles = useStyles();

  const tones: Record<BadgeTone, { background: string; foreground: string }> = {
    info: { background: theme.colors.infoTint, foreground: theme.colors.info },
    success: { background: theme.colors.successTint, foreground: theme.colors.success },
    warning: { background: theme.colors.warningTint, foreground: theme.colors.accentHover },
    danger: { background: theme.colors.dangerTint, foreground: theme.colors.danger },
    neutral: { background: theme.colors.trackSubtle, foreground: theme.colors.textSecondary },
  };
  const { background, foreground } = tones[tone];

  return (
    <View testID={testID} style={[styles.base, { backgroundColor: background }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: foreground }]} /> : null}
      <Text style={[styles.label, { color: foreground }]}>{children}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: theme.typography.size.xs,
    fontWeight: theme.typography.weight.bold,
    letterSpacing: letterSpacing(theme.typography.size.xs, theme.typography.tracking.wide),
  },
}));
