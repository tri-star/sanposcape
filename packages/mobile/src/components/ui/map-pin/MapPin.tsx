import { type StyleProp, Text, View, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type MapPinCategory = "park" | "cafe" | "culture" | "station" | "goal" | "current";

export type MapPinProps = {
  category?: MapPinCategory;
  /** カテゴリ既定のアイコンを上書きする。 */
  icon?: IconName;
  /** ピン下に出す小さなラベル。 */
  label?: string;
  /** ティアドロップの一辺（px）。 */
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DEFAULT_ICON: Record<MapPinCategory, IconName> = {
  park: "tree-pine",
  cafe: "coffee",
  culture: "book-open",
  station: "train-front",
  goal: "flag",
  current: "navigation",
};

/**
 * MapPin — カテゴリごとに色分けしたティアドロップ型のマーカー。
 * デザイン: Sanpo Design System / components/map/MapPin
 */
export function MapPin({ category = "cafe", icon, label, size = 40, style, testID }: MapPinProps) {
  const theme = useTheme();
  const styles = useStyles();

  const color =
    category === "goal"
      ? theme.map.station
      : category === "current"
        ? theme.map.route
        : theme.map[category];

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View
        style={[
          styles.teardrop,
          {
            width: size,
            height: size,
            backgroundColor: color,
            borderTopLeftRadius: size / 2,
            borderTopRightRadius: size / 2,
            borderBottomRightRadius: size / 2,
            borderColor: theme.colors.surfaceCard,
          },
        ]}
      >
        {/* ティアドロップを -45deg 回転させているので、中のアイコンは +45deg 戻す */}
        <View style={styles.glyph}>
          <Icon
            name={icon ?? DEFAULT_ICON[category]}
            size={Math.round(size * 0.42)}
            color="#ffffff"
            strokeWidth={2.4}
          />
        </View>
      </View>
      {label ? (
        <Text numberOfLines={1} style={[styles.label, { color }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
  },
  teardrop: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 0,
    borderWidth: 2.5,
    transform: [{ rotate: "-45deg" }],
    ...theme.shadows.pin,
  },
  glyph: {
    transform: [{ rotate: "45deg" }],
  },
  label: {
    marginTop: theme.spacing[1],
    paddingVertical: 3,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceCard,
    fontSize: theme.typography.size["2xs"],
    fontWeight: theme.typography.weight.bold,
    overflow: "hidden",
    ...theme.shadows.xs,
  },
}));
