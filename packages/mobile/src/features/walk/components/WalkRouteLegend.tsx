import { Text, View } from "react-native";

import { walkMapLegendItems } from "@/features/walk/lib/walkRouteLegs";
import { walkTrailStyle } from "@/features/walk/lib/walkTrailStyle";
import type { WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkRouteLegendProps = {
  /** 周回ルート。未取得（null）なら往路/復路の項目は出さない。 */
  walkRoute: WalkRoute | null;
  /**
   * 散歩中に歩いた軌跡（SS-168）。線として描ける（2点以上）なら「歩いた道」を足す。
   * 散歩開始画面では渡さない。
   */
  trail?: readonly GeoCoordinates[];
  testID?: string;
};

const NO_TRAIL: readonly GeoCoordinates[] = [];

/**
 * WalkRouteLegend — 地図の左下に重ねる、往路/復路（散歩中は歩いた道も。SS-168）の凡例。
 * 散歩開始画面（`SpotMapView`）と散歩中画面（`WalkRouteMapView`）の両方から使う。
 * 判定（現在どちらの区間にいるか）は行わない。描き分け＋凡例だけで表現する（SS-33）。
 */
export function WalkRouteLegend({ walkRoute, trail = NO_TRAIL, testID }: WalkRouteLegendProps) {
  const theme = useTheme();
  const styles = useStyles();
  const items = walkMapLegendItems(walkRoute, trail);
  const trailStyle = walkTrailStyle(theme);

  if (items.length === 0) {
    return null;
  }

  const accessibilityLabel = `地図の線: ${items.map((item) => item.label).join("、")}`;

  return (
    // `accessible` を明示し、外側の要約ラベルだけを読み上げさせる。
    // 明示しないと、Android の TalkBack が子の `Text`（「行き」「帰り」）も
    // 個別にフォーカス可能とみなし、要約と個々のラベルを二重に読み上げることがある。
    <View
      testID={testID}
      style={styles.root}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {items.map((item) => (
        <View
          key={item.kind}
          style={styles.item}
          testID={testID ? `${testID}-${item.kind}` : undefined}
        >
          {/* 復路の破線見本（borderStyle: "dashed"）は Android 実機で描画されることを確認済み（2026-09-16）。 */}
          <View
            style={[
              styles.swatch,
              item.kind === "return"
                ? { borderColor: theme.map.routeReturn, borderStyle: "dashed" }
                : item.kind === "trail"
                  ? { borderColor: trailStyle.color, borderStyle: "solid" }
                  : { borderColor: theme.map.route, borderStyle: "solid" },
            ]}
          />
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    position: "absolute",
    left: theme.spacing[3],
    bottom: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    ...theme.shadows.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  swatch: {
    width: 20,
    height: 0,
    borderTopWidth: 3,
  },
  label: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textSecondary,
  },
}));
