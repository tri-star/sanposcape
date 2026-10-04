import { View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { SANPO_MAP_ICON_META } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMapIconKey } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapIconBadgeProps = {
  icon: SanpoMapIconKey;
  /** 丸の直径（px）。既定 36。 */
  size?: number;
};

/**
 * SanpoMapIconBadge — 地図アイコンを「色の丸 + 白いグリフ」で出す表示専用の部品（SS-171）。
 * 装飾なので読み上げ対象にしない（地図名などの文脈は親が持つ）。a11y から隠した subtree の testID は
 * Maestro（Android は accessibility 階層を読む）から見えないので、testID は持たない。E2E は親のボタンの
 * accessibilityLabel で確かめる（ADR-M-019）。
 */
export function SanpoMapIconBadge({ icon, size = 36 }: SanpoMapIconBadgeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const meta = SANPO_MAP_ICON_META[icon];

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.root,
        {
          width: size,
          height: size,
          backgroundColor: theme.map[meta.tone],
        },
      ]}
    >
      <Icon name={meta.glyph} size={Math.round(size * 0.5)} color={theme.colors.onColor} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
  },
}));
