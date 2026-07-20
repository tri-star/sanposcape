import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import {
  resolveBadgeAppearance,
  type BadgeSize,
  type BadgeVariant,
} from "@/components/ui/badge/badgeStyles";

export type BadgeProps = {
  /** 未指定ならドットバッジ */
  label?: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  testID?: string;
};

export function Badge({ label, variant = "neutral", size = "md", testID }: BadgeProps) {
  const { theme } = useUnistyles();
  const appearance = resolveBadgeAppearance(theme, { variant, size });

  if (label === undefined) {
    return (
      <View
        testID={testID}
        // ドットバッジは装飾(通知の有無を色で示すのみ)のため、スクリーンリーダーからは隠す
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: appearance.dotSize,
          height: appearance.dotSize,
          borderRadius: appearance.borderRadius,
          backgroundColor: appearance.textColor,
        }}
      />
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={{
        height: appearance.height,
        paddingHorizontal: appearance.paddingHorizontal,
        borderRadius: appearance.borderRadius,
        backgroundColor: appearance.backgroundColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: appearance.textColor,
          fontFamily: theme.fontFamily.label,
          ...theme.typography.label,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
