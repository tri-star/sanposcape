import { View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { SANPO_MAP_ICON_META, type SanpoMapIconKey } from "@/features/pin/lib/sanpoMapIcon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapIconBadgeProps = {
  icon: SanpoMapIconKey;
  /** 丸の直径（px）。既定 36。 */
  size?: number;
  /** 付けると root に testID、内側に `${testID}-${icon}` を付ける（状態ごとに root を付け替えない規約。E2E が使う）。 */
  testID?: string;
};

/**
 * SanpoMapIconBadge — 地図アイコンを「色の丸 + 白いグリフ」で出す表示専用の部品（SS-171）。
 * 装飾なので読み上げ対象にしない（地図名などの文脈は親が持つ）。
 */
export function SanpoMapIconBadge({ icon, size = 36, testID }: SanpoMapIconBadgeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const meta = SANPO_MAP_ICON_META[icon];

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID={testID}
      style={[
        styles.root,
        {
          width: size,
          height: size,
          backgroundColor: theme.map[meta.tone],
        },
      ]}
    >
      <View testID={testID === undefined ? undefined : `${testID}-${icon}`}>
        <Icon name={meta.glyph} size={Math.round(size * 0.5)} color={theme.colors.onColor} />
      </View>
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
