import { View } from "react-native";

import { mapPinArtSurfaceColor } from "@/components/ui/map-pin/MapPin";
import { SanpoMapIconArt } from "@/features/pin/components/SanpoMapIconArt";
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
 * SanpoMapIconBadge — 地図アイコンを「系統色を薄めた丸 + カラーの画像」で出す表示専用の部品（SS-171。SS-191 で画像に）。
 * 丸の色は地図上のピンの頭と同じ（`mapPinArtSurfaceColor`）。
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
          backgroundColor: mapPinArtSurfaceColor(theme, theme.map[meta.tone]),
        },
      ]}
    >
      <SanpoMapIconArt icon={icon} size={Math.round(size * ART_RATIO)} />
    </View>
  );
}

/** 画像の一辺 ÷ 丸の直径。 */
const ART_RATIO = 0.64;

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
  },
}));
