import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { resolveBadgeAppearance, type BadgeVariant } from "@/components/ui/badge/badgeStyles";

export type BadgeProps = {
  /** 未指定ならドットバッジ */
  label?: string;
  /** 既定 "info"(DS の既定 tone) */
  variant?: BadgeVariant;
  testID?: string;
};

export function Badge({ label, variant = "info", testID }: BadgeProps) {
  const args = { variant };

  if (label === undefined) {
    return (
      <View
        testID={testID}
        // ドットバッジは装飾(通知の有無を色で示すのみ)のため、スクリーンリーダーからは隠す
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.dot(args)}
      />
    );
  }

  return (
    <View testID={testID} accessibilityRole="text" style={styles.root(args)}>
      <Text style={styles.label(args)}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: (args: { variant: BadgeVariant }) => {
    const appearance = resolveBadgeAppearance(theme, args);
    return {
      paddingHorizontal: appearance.paddingHorizontal,
      paddingVertical: appearance.paddingVertical,
      borderRadius: appearance.borderRadius,
      backgroundColor: appearance.backgroundColor,
      alignItems: "center",
      justifyContent: "center",
    };
  },
  dot: (args: { variant: BadgeVariant }) => {
    const appearance = resolveBadgeAppearance(theme, args);
    return {
      width: appearance.dotSize,
      height: appearance.dotSize,
      borderRadius: appearance.borderRadius,
      backgroundColor: appearance.textColor,
    };
  },
  label: (args: { variant: BadgeVariant }) => {
    const appearance = resolveBadgeAppearance(theme, args);
    return {
      color: appearance.textColor,
      fontFamily: theme.fontFamily.label,
      ...theme.typography.badgeLabel,
    };
  },
}));
