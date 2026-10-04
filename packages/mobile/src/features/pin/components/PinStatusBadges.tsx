import { type StyleProp, View, type ViewStyle } from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import type { PinStatusBadge } from "@/features/pin/lib/pinStatus";
import { makeStyles } from "@/theme/makeStyles";

export type PinStatusBadgesProps = {
  /** resolvePinStatusBadges の結果。空なら何も描かない（null を返す）。 */
  badges: readonly PinStatusBadge[];
  /** 各バッジの testID は `${testIDPrefix}-${badge.key}`。行全体は `${testIDPrefix}`。 */
  testIDPrefix: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * PinStatusBadges — ピンの状態バッジの横並び（SS-173）。詳細と地図詳細の一覧の行で共用する。
 * 読み上げは親（Pressable の accessibilityLabel など）で合成するので、ここでは a11y を足さない。
 */
export function PinStatusBadges({ badges, testIDPrefix, style }: PinStatusBadgesProps) {
  const styles = useStyles();
  if (badges.length === 0) return null;

  return (
    <View style={[styles.row, style]} testID={testIDPrefix}>
      {badges.map((badge) => (
        <Badge key={badge.key} tone={badge.tone} testID={`${testIDPrefix}-${badge.key}`}>
          {badge.label}
        </Badge>
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
}));
